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

    // Public Web application OAuth client used for Google Health reads via
    // Google Identity Services. The Google Health API must be enabled for this
    // client, its read scopes must be on the consent screen, and this site's
    // origin must be an Authorized JavaScript origin. Falls back to
    // googleClientId when left empty. No client secret belongs here.
    healthClientId: "1013456010911-siqtovnrctmjods5ei50bf89qper5lv7.apps.googleusercontent.com"
  };
})();
