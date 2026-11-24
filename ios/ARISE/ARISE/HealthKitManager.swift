import Foundation
import HealthKit
import WebKit

/* Reads the last 40 days from HealthKit, shapes them into the same snapshot the
   web dashboard already understands, and pushes it through the WKWebView bridge.
   Nothing leaves the device. */
final class HealthKitManager {
    static let shared = HealthKitManager()

    private let store = HKHealthStore()
    private weak var webView: WKWebView?
    private var isSyncing = false
    private var authorized = false

    private let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    func attach(webView: WKWebView) {
        self.webView = webView
    }

    // MARK: - bridge

    func postStatus(message: String? = nil) {
        evaluate(event: "arise:status", detail: [
            "available": HKHealthStore.isHealthDataAvailable(),
            "authorized": authorized,
            "syncing": isSyncing,
            "message": message ?? ""
        ])
    }

    private func evaluate(event: String, detail: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        let script = "window.dispatchEvent(new CustomEvent('\(event)',{detail:\(json)}));"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(script) { _, error in
                if let error = error {
                    NSLog("ARISE bridge error: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - authorization

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        let quantities: [HKQuantityTypeIdentifier] = [
            .stepCount,
            .basalEnergyBurned,
            .activeEnergyBurned,
            .appleExerciseTime,
            .heartRateVariabilitySDNN,
            .restingHeartRate,
            .respiratoryRate,
            .vo2Max,
            .heartRate
        ]
        for identifier in quantities {
            if let type = HKQuantityType.quantityType(forIdentifier: identifier) {
                types.insert(type)
            }
        }
        if #available(iOS 16.0, *) {
            if let type = HKQuantityType.quantityType(forIdentifier: .wristTemperature) {
                types.insert(type)
            }
        }
        if let sleep = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        types.insert(HKObjectType.workoutType())
        return types
    }

    func syncIfReady() {
        guard HKHealthStore.isHealthDataAvailable() else {
            postStatus(message: "HealthKit is not available on this device.")
            return
        }
        guard let steps = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            postStatus(message: "Step data is unavailable.")
            return
        }
        switch store.authorizationStatus(for: steps) {
        case .sharingDenied:
            authorized = false
            postStatus(message: "Health access is off. Tap SYNC HEALTHKIT to request it.")
        case .notDetermined:
            postStatus(message: "Tap SYNC HEALTHKIT to grant Health access.")
        default:
            authorized = true
            postStatus(message: "HealthKit connected.")
            sync()
        }
    }

    func requestAuthorizationAndSync() {
        guard HKHealthStore.isHealthDataAvailable() else {
            postStatus(message: "HealthKit is not available on this device.")
            return
        }
        store.requestAuthorization(toShare: [], read: readTypes) { [weak self] success, error in
            guard let self = self else { return }
            self.authorized = success && error == nil
            if self.authorized {
                self.postStatus(message: "Health access granted.")
                self.sync()
            } else {
                self.postStatus(message: "Health access denied. Open Settings → Privacy & Security → Health → ARISE to enable it.")
            }
        }
    }

    // MARK: - snapshot

    func sync() {
        guard !isSyncing else { return }
        isSyncing = true
        postStatus(message: "Reading Apple Watch data…")

        let calendar = Calendar.current
        let now = Date()
        let start = calendar.date(byAdding: .day, value: -39, to: calendar.startOfDay(for: now))!
        let predicate = HKQuery.predicateForSamples(
            withStart: start,
            end: now,
            options: .strictStartDate
        )
        let dayInterval = DateComponents(day: 1)

        let lock = DispatchQueue(label: "com.arise.snapshot")
        let group = DispatchGroup()
        var days: [String: [String: Any]] = [:]
        var workouts: [[String: Any]] = []
        var records = 0

        func put(_ key: String, _ metric: String, _ value: Double) {
            lock.sync {
                var day = days[key] ?? [:]
                day[metric] = value
                days[key] = day
                records += 1
            }
        }

        func accumulate(_ key: String, _ metric: String, _ hours: Double) {
            lock.sync {
                var day = days[key] ?? [:]
                day[metric] = (day[metric] as? Double ?? 0) + hours
                days[key] = day
                records += 1
            }
        }

        func cumulative(_ id: HKQuantityTypeIdentifier, unit: HKUnit, metric: String) {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
            group.enter()
            let query = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: [.cumulativeSum],
                anchorDate: start,
                intervalComponents: dayInterval
            )
            query.initialResultsHandler = { [weak self] _, collection, _ in
                guard let self = self else { group.leave(); return }
                collection?.enumerateStatistics(from: start, to: now) { stats, _ in
                    if let value = stats.sumQuantity()?.doubleValue(for: unit) {
                        put(self.dayFormatter.string(from: stats.startDate), metric, value)
                    }
                }
                group.leave()
            }
            store.execute(query)
        }

        func average(_ id: HKQuantityTypeIdentifier, unit: HKUnit, metric: String) {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { return }
            group.enter()
            let query = HKStatisticsCollectionQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: [.discreteAverage],
                anchorDate: start,
                intervalComponents: dayInterval
            )
            query.initialResultsHandler = { [weak self] _, collection, _ in
                guard let self = self else { group.leave(); return }
                collection?.enumerateStatistics(from: start, to: now) { stats, _ in
                    if let value = stats.averageQuantity()?.doubleValue(for: unit) {
                        put(self.dayFormatter.string(from: stats.startDate), metric, value)
                    }
                }
                group.leave()
            }
            store.execute(query)
        }

        cumulative(.stepCount, unit: .count(), metric: "steps")
        cumulative(.basalEnergyBurned, unit: .kilocalorie(), metric: "basalEnergy")
        cumulative(.activeEnergyBurned, unit: .kilocalorie(), metric: "activeEnergy")
        cumulative(.appleExerciseTime, unit: .minute(), metric: "exerciseMinutes")

        average(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), metric: "hrv")
        average(.restingHeartRate, unit: .count().unitDivided(by: .minute()), metric: "rhr")
        average(.respiratoryRate, unit: .count().unitDivided(by: .minute()), metric: "respiratory")
        average(.vo2Max, unit: HKUnit(from: "ml/min·kg"), metric: "vo2max")
        if #available(iOS 16.0, *) {
            average(.wristTemperature, unit: .degreeCelsius(), metric: "wristTemp")
        }

        if let heartRate = HKQuantityType.quantityType(forIdentifier: .heartRate) {
            group.enter()
            let query = HKStatisticsCollectionQuery(
                quantityType: heartRate,
                quantitySamplePredicate: predicate,
                options: [.discreteAverage, .discreteMin, .discreteMax],
                anchorDate: start,
                intervalComponents: dayInterval
            )
            query.initialResultsHandler = { [weak self] _, collection, _ in
                guard let self = self else { group.leave(); return }
                collection?.enumerateStatistics(from: start, to: now) { stats, _ in
                    let key = self.dayFormatter.string(from: stats.startDate)
                    let unit = HKUnit.count().unitDivided(by: .minute())
                    if let value = stats.averageQuantity()?.doubleValue(for: unit) { put(key, "hrAvg", value) }
                    if let value = stats.minimumQuantity()?.doubleValue(for: unit) { put(key, "hrMin", value) }
                    if let value = stats.maximumQuantity()?.doubleValue(for: unit) { put(key, "hrMax", value) }
                }
                group.leave()
            }
            store.execute(query)
        }

        if let sleepType = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let query = HKSampleQuery(
                sampleType: sleepType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [
                    NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
                ]
            ) { [weak self] _, samples, _ in
                guard let self = self else { group.leave(); return }
                for case let sample as HKCategorySample in samples ?? [] {
                    // Raw values are stable across SDKs and cover legacy "asleep" samples:
                    // 0 asleep/unspecified, 1 inBed, 2 awake, 3 core, 4 deep, 5 REM.
                    let metric: String?
                    switch sample.value {
                    case 4: metric = "deepHours"
                    case 5: metric = "remHours"
                    case 3, 0: metric = "coreHours"
                    case 2: metric = "awakeHours"
                    default: metric = nil
                    }
                    guard let target = metric else { continue }
                    let hours = sample.endDate.timeIntervalSince(sample.startDate) / 3600
                    if hours > 0 {
                        accumulate(self.dayFormatter.string(from: sample.endDate), target, hours)
                    }
                }
                group.leave()
            }
            store.execute(query)
        }

        group.enter()
        let workoutQuery = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [
                NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
            ]
        ) { [weak self] _, samples, _ in
            guard let self = self else { group.leave(); return }
            for case let workout as HKWorkout in samples ?? [] {
                let entry: [String: Any] = [
                    "rawName": Self.workoutName(workout.workoutActivityType),
                    "start": self.isoFormatter.string(from: workout.startDate),
                    "end": self.isoFormatter.string(from: workout.endDate),
                    "duration": workout.duration / 60.0,
                    "energy": workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0,
                    "source": workout.source?.name ?? "Apple Watch"
                ]
                lock.sync {
                    workouts.append(entry)
                    records += 1
                }
            }
            group.leave()
        }
        store.execute(workoutQuery)

        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            var dayMap: [String: [String: Any]] = [:]
            var gates: [[String: Any]] = []
            var count = 0
            lock.sync {
                dayMap = days
                gates = workouts
                count = records
            }

            self.isSyncing = false
            let stamp = Self.timeString()
            self.postStatus(message: "Synced \(stamp) · \(dayMap.count) days")
            self.evaluate(event: "arise:snapshot", detail: [
                "source": "Apple Watch · HealthKit",
                "filename": "healthkit-live",
                "records": count,
                "days": dayMap,
                "workouts": gates
            ])
        }
    }

    // MARK: - helpers

    private static func timeString() -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: Date())
    }

    /* Match names against the gate patterns in js/data.js. Using the type's
       description avoids depending on enum cases that shift between SDKs. */
    private static func workoutName(_ type: HKWorkoutActivityType) -> String {
        let name = String(describing: type).lowercased()
        if name.contains("run") { return "Running" }
        if name.contains("walk") { return "Walking" }
        if name.contains("hik") { return "Hiking" }
        if name.contains("cycl") || name.contains("bike") { return "Cycling" }
        if name.contains("swim") { return "Swimming" }
        if name.contains("strength") || name.contains("core") || name.contains("functional") { return "Strength Training" }
        if name.contains("highintensity") || name.contains("cross") || name.contains("interval") { return "HIIT" }
        if name.contains("yoga") || name.contains("pilates") || name.contains("flexibility") { return "Yoga" }
        if name.contains("row") { return "Rowing" }
        if name.contains("elliptical") || name.contains("stair") || name.contains("climb") { return "Climbing" }
        if name.contains("box") || name.contains("kick") || name.contains("martial") { return "Boxing" }
        if name.contains("tennis") || name.contains("squash") || name.contains("badminton") { return "Tennis" }
        if name.contains("basket") || name.contains("soccer") || name.contains("football") || name.contains("volleyball") { return "Sport" }
        if name.contains("dance") { return "Dance" }
        return "Workout"
    }
}
