require("dotenv").config();

const express = require("express");
const XLSX = require("xlsx");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
app.use(cors());

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

async function downloadExcel(fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

/* ================= EXCEL PARSER ================= */

function readExcelFromBuffer(buffer, type, machineName) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const base = {
    wheelCode: clean(sheet["H5"]?.v),
    wheelSize: clean(sheet["H6"]?.v),
    testReason: clean(sheet["B38"]?.v),
  };

  function addUnit(value, unit) {
    if (value === null || value === undefined || value === "") return null;
    return `${value} ${unit}`;
  }

  /* ================= CFT ================= */

  if (type === "CFT") {
    return {
      ...base,
      bendingMovement: addUnit(clean(sheet["H31"]?.v), "kN"),
      acceptedCycles: clean(sheet["H33"]?.v),
      testLoad: null,
    };
  }

  /* ================= BI AXIAL ================= */

  if (
    machineName === "BI AXIAL-LP" ||
    machineName === "BI AXIAL-CV"
  ) {
    return {
      ...base,
      bendingMovement: null,
      testLoad: addUnit(clean(sheet["F19"]?.v), "kg"),
      acceptedCycles: clean(sheet["W27"]?.v),
    };
  }

  /* ================= RFT ================= */

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
};

/* ================= UPDATE FUNCTION ================= */

async function updateDashboardData() {
  const result = { ...cachedDashboardData };

  for (const file of FILES) {
    const buffer = await downloadExcel(file.fileId);
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

      file.name === "BI AXIAL-LP"
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
  }

  cachedDashboardData = result;
  console.log("Dashboard updated at", new Date().toLocaleTimeString());
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/api/dashboard-data", (req, res) => {
  res.json(cachedDashboardData);
});

/* ================= SCHEDULER ================= */

updateDashboardData();
setInterval(updateDashboardData, 10 * 60 * 1000);

/* ================= START SERVER ================= */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});