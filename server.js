require("dotenv").config();

const express = require("express");
const XLSX = require("xlsx");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");

const app = express();

// ---------------------------------------------------------------------
// CHANGE 1: CORS is now restricted to your actual frontend's URL,
// instead of allowing every website on the internet to call this API.
// Set FRONTEND_URL in your .env file, e.g.:
//   FRONTEND_URL=https://your-frontend-domain.com
// ---------------------------------------------------------------------
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
  })
);

// ---------------------------------------------------------------------
// CHANGE 2: Needed so req.body actually gets filled in on POST
// requests (like /api/login). Without this, req.body would be
// undefined, and reading req.body.username would crash.
// ---------------------------------------------------------------------
app.use(express.json());

const PORT = process.env.PORT || 5000;

/* ================= GOOGLE AUTH ================= */

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON missing");
}

const credentials = JSON.parse(
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const drive = google.drive({ version: "v3", auth });

/* ================= LOGIN AUTH SETUP ================= */

// ---------------------------------------------------------------------
// CHANGE 3: The username/password are no longer written in the
// frontend's JavaScript (where anyone could read them). They now live
// in this backend's .env file instead — never sent to the browser.
//
// ADMIN_PASSWORD_HASH should be a bcrypt HASH, not the plain password.
// To generate one, run this once in a Node console:
//   const bcrypt = require("bcrypt");
//   bcrypt.hash("your-real-password", 10).then(console.log);
// Then paste the result into your .env file as ADMIN_PASSWORD_HASH.
//
// This is still just ONE fixed account (no database yet, as agreed) —
// but at minimum, the real password is no longer visible to anyone
// who opens browser dev tools, and it's not stored in plain text
// even here on the backend.
// ---------------------------------------------------------------------
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
  throw new Error("ADMIN_USERNAME or ADMIN_PASSWORD_HASH missing from .env");
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET missing from .env");
}

/* ================= FILE MAP ================= */

const FILES = [
  { name: "CFT-1", fileId: "1ZzOgrZgjAKXkM4c2KF4Gg34V16_71rB2", type: "CFT" },
  { name: "CFT-2", fileId: "1aPQLnQvDdBMMlhifoWXNu-MBRRWCBRir", type: "CFT" },
  { name: "CFT-3", fileId: "1U4zB-81xLgyp_R--Utxsr3PDk-aUCIlV", type: "CFT" },

  { name: "RFT-1", fileId: "1ut8udLSw4XmewBw7dVjWFsM-HL77kLXO", type: "RFT" },
  { name: "RFT-2", fileId: "1s8jUgqu7ypDi3dE3n5qQsUMco9uC331d", type: "RFT" },
  { name: "RFT-3", fileId: "1LurYup84SSTQnq5L754ahMLM0Xr03Mf_", type: "RFT" },
  { name: "RFT-4", fileId: "1EQHiQb5L4zTxRLsUssiKBWsm8lGUZu7d", type: "RFT" },

  { name: "RFT-5", fileId: "1tGRKVvD5c-ZcKhR2QwDetumzXRDmEOts", type: "RFT" },
  { name: "RFT-6", fileId: "1y6dbDqzlIUuJIQ8oWudfoPXpjm3PMkNX", type: "RFT" },

  { name: "BI AXIAL-LP", fileId: "1PIK9kYSOd0WtMusfmqqVHEm_iWuOgqwE", type: "OTHER" },
  { name: "BI AXIAL-CV", fileId: "17I8YfQMlgMP_RKuRIkZVQw9lse3psGWK", type: "OTHER" },
];

/* ================= HELPERS ================= */

function clean(value) {
  if (!value) return "";
  return String(value)
    .replace(/WHEEL CODE\s*:/i, "")
    .replace(/WHEEL SIZE\s*:/i, "")
    .replace(/TEST REASON\s*:/i, "")
    .replace(/BENDING MOMENT\s*:/i, "")
    .replace(/BENDING MOVEMENT\s*:/i, "")
    .replace(/TEST LOAD\s*:/i, "")
    .trim();
}

// ---------------------------------------------------------------------
// CHANGE 4: try/catch added. If Google Drive fails for this ONE file
// (bad ID, network hiccup, expired credentials, etc.), this function
// now logs the problem and returns null, instead of throwing an error
// that would crash the entire update loop for ALL 11 machines.
// ---------------------------------------------------------------------
async function downloadExcel(fileId) {
  try {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data);
  } catch (error) {
    console.log("Failed to download file:", fileId, "-", error.message);
    return null;
  }
}

/* ================= EXCEL PARSER ================= */

function readExcelFromBuffer(buffer, type, machineName) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const testReasonPart1 = clean(sheet["K16"]?.v);
  const testReasonPart2 = clean(sheet["K17"]?.v);
  const combinedTestReason = [testReasonPart1, testReasonPart2]
    .filter((part) => part !== "")
    .join(" ");

  const base = {
    wheelCode: clean(sheet["H5"]?.v),
    wheelSize: clean(sheet["H6"]?.v),
    testReason: combinedTestReason,
  };

  function addUnit(value, unit) {
    if (value === null || value === undefined || value === "") return null;
    return `${value} ${unit}`;
  }

  if (type === "CFT") {
    return {
      ...base,
      bendingMovement: addUnit(clean(sheet["H31"]?.v), "kN"),
      acceptedCycles: clean(sheet["H33"]?.v),
      testLoad: null,
    };
  }

  if (machineName === "BI AXIAL-LP" || machineName === "BI AXIAL-CV") {
    return {
      ...base,
      bendingMovement: null,
      testLoad: null,
      testSpec: clean(sheet["W26"]?.v),
      acceptedCycles: clean(sheet["W27"]?.v),
    };
  }

  return {
    ...base,
    bendingMovement: null,
    testLoad: addUnit(clean(sheet["H22"]?.v), "kg"),
    acceptedCycles: clean(sheet["H27"]?.v),
  };
}

/* ================= CACHE ================= */

let cachedDashboardData = {};
let lastCyclesValue = {
  "CFT-1": "",
  "CFT-2": "",
  "CFT-3": "",

  "RFT-1": "",
  "RFT-2": "",
  "RFT-3": "",
  "RFT-4": "",
  "RFT-5": "",
  "RFT-6": "",

  "BI AXIAL-LP": "",
  "BI AXIAL-CV": "",
};

/* ================= UPDATE FUNCTION ================= */

async function updateDashboardData() {
  const result = { ...cachedDashboardData };

  for (const file of FILES) {
    // CHANGE 5: downloadExcel can now return null (see CHANGE 4 above).
    // If it does, skip this ONE file and continue with the rest of the
    // loop, instead of crashing on the next line when XLSX.read()
    // tries to read a Buffer that doesn't exist.
    const buffer = await downloadExcel(file.fileId);

    if (!buffer) {
      console.log("Skipping", file.name, "this cycle - download failed.");
      continue;
    }

    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      let data = readExcelFromBuffer(buffer, file.type, file.name);

      if (
        file.name === "CFT-1" ||
        file.name === "CFT-2" ||
        file.name === "CFT-3" ||
        file.name === "RFT-1" ||
        file.name === "RFT-2" ||
        file.name === "RFT-3" ||
        file.name === "RFT-4" ||
        file.name === "RFT-5" ||
        file.name === "RFT-6" ||
        file.name === "BI AXIAL-LP" ||
        file.name === "BI AXIAL-CV"
      ) {
        const newCycles = clean(sheet["AI14"]?.v);

        if (String(newCycles).trim() !== "") {
          lastCyclesValue[file.name] = String(newCycles).trim();
        }

        data.cycles = lastCyclesValue[file.name];
      }

      result[file.name] = {
        machine: file.name,
        ...data,
      };
    } catch (error) {
      // CHANGE 6: if PARSING this file fails (corrupted file, unexpected
      // format, etc.), log it and move on to the next file, instead of
      // crashing the whole update cycle.
      console.log("Failed to parse", file.name, "-", error.message);
    }
  }

  cachedDashboardData = result;
  console.log("Dashboard updated at", new Date().toLocaleTimeString());
}

/* ================= AUTH MIDDLEWARE ================= */

// ---------------------------------------------------------------------
// CHANGE 7: This function checks whether a request carries a valid
// JWT. Any route that uses this as a second argument (see
// /api/dashboard-data below) will be BLOCKED unless the request
// includes a valid token in its Authorization header.
// ---------------------------------------------------------------------
function requireLogin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next(); // token is valid - let the request continue to the actual route
  } catch (error) {
    return res.status(401).json({ error: "Token expired or invalid" });
  }
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// ---------------------------------------------------------------------
// CHANGE 8: The new login route. The frontend sends { username,
// password } here. If they match the values in .env (checked with a
// bcrypt hash comparison, not a plain-text ===), a JWT is created and
// sent back. The frontend will store this token and send it along
// with future requests to prove it's still logged in.
// ---------------------------------------------------------------------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password required" });
    }

    const usernameMatches = username === process.env.ADMIN_USERNAME;
    const passwordMatches = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);

    if (usernameMatches && passwordMatches) {
      const token = jwt.sign(
        { username: username },
        process.env.JWT_SECRET,
        { expiresIn: "2h" }
      );
      return res.json({ success: true, token });
    }

    return res.status(401).json({ success: false, message: "Invalid credentials" });
  } catch (error) {
    console.log("Login error:", error.message);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
});

// ---------------------------------------------------------------------
// CHANGE 9: requireLogin is now inserted as a second argument. Express
// runs it BEFORE the actual route handler. If requireLogin calls
// res.status(401)..., it never calls next(), so the handler below
// never runs, and the request is rejected.
// ---------------------------------------------------------------------
app.get("/api/dashboard-data", requireLogin, (req, res) => {
  res.json(cachedDashboardData);
});

/* ================= SCHEDULER ================= */

updateDashboardData();
setInterval(updateDashboardData, 10 * 60 * 1000);

/* ================= START SERVER ================= */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
