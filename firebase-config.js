/* =========================================================
   ARISE // Firebase web configuration
   ---------------------------------------------------------
   Paste your Firebase web app values here. This config is public;
   access is controlled by Firebase Authentication + Security Rules.
   Leave the placeholders as-is to keep the app in local-only mode.
   ========================================================= */
(function () {
  "use strict";

  window.ARISE_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBlisDjd2v_SwunsbV2CeVvKptPT0Fqpc0",
    authDomain: "arise-hunter-system-a118f.firebaseapp.com",
    projectId: "arise-hunter-system-a118f",
    appId: "1:1013456010911:web:cf92102ec2a33d83636caa",

    // Public Google Identity Services client ID for the Sign in with Google button.
    googleClientId: "1013456010911-siqtovnrctmjods5ei50bf89qper5lv7.apps.googleusercontent.com",

    // Public OAuth client used for Google Health reads. The Google Health API
    // must be enabled for this client, and its read scopes must be on the
    // OAuth consent screen. Falls back to googleClientId when left empty.
    healthClientId: "1013456010911-siqtovnrctmjods5ei50bf89qper5lv7.apps.googleusercontent.com",

    // Exact URI registered under "Authorized redirect URIs" for the code flow.
    // Leave empty to use the current page URL (GitHub Pages subfolder included).
    healthRedirectUri: ""
  };
})();
