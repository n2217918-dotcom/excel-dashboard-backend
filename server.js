// 🔹 LOAD ENVIRONMENT VARIABLES
require("dotenv").config();

const express = require("express");
const XLSX = require("xlsx");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 5000;

// 🔹 GOOGLE DRIVE AUTH (SERVICE ACCOUNT)
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"]
});

const drive = google.drive({ version: "v3", auth });

// 🔹 FILE MAP (GOOGLE DRIVE BASED)
const FILES = [
  { name: "CFT-1", fileId: "1ZzOgrZgjAKXkM4c2KF4Gg34V16_71rB2", type: "CFT" },
  { name: "CFT-2", fileId: "1aPQLnQvDdBMMlhifoWXNu-MBRRWCBRir", type: "CFT" },
  { name: "CFT-3", fileId: "1U4zB-81xLgyp_R--Utxsr3PDk-aUCIlV", type: "CFT" },
  { name: "RFT-1", fileId: "1ut8udLSw4XmewBw7dVjWFsM-HL77kLXO", type: "RFT" },
  { name: "RFT-2", fileId: "1s8jUgqu7ypDi3dE3n5qQsUMco9uC331d", type: "RFT" },
  { name: "RFT-3", fileId: "1LurYup84SSTQnq5L754ahMLM0Xr03Mf_", type: "RFT" },
  { name: "BI AXIAL-LP", fileId: "1PIK9kYSOd0WtMusfmqqVHEm_iWuOgqwE", type: "OTHER" },
  { name: "BI AXIAL-CV", fileId: "17I8YfQMlgMP_RKuRIkZVQw9lse3psGWK", type: "OTHER" }
];

// 🔹 REMOVE LABELS FROM EXCEL CELL VALUES
function cleanValue(value) {
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

// 🔹 DOWNLOAD EXCEL FROM GOOGLE DRIVE (BUFFER)
async function downloadExcel(fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data);
}

// 🔹 READ DATA FROM EXCEL BUFFER
function readExcelFromBuffer(buffer, type) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const baseData = {
    wheelCode: cleanValue(sheet["B7"]?.v),
    wheelSize: cleanValue(sheet["B8"]?.v),
    testReason: cleanValue(sheet["B37"]?.v)
  };

  if (type === "CFT") {
    return {
      ...baseData,
      bendingMovement: cleanValue(sheet["B30"]?.v),
      testLoad: null
    };
  } else {
    return {
      ...baseData,
      bendingMovement: null,
      testLoad: cleanValue(sheet["B20"]?.v)
    };
  }
}

// 🔹 ROOT ROUTE
app.get("/", (req, res) => {
  res.send("✅ Backend is running successfully");
});

// 🔹 DASHBOARD API
app.get("/api/dashboard-data", async (req, res) => {
  try {
    const result = {};

    for (const file of FILES) {
      const buffer = await downloadExcel(file.fileId);
      const data = readExcelFromBuffer(buffer, file.type);

      result[file.name] = {
        machine: file.name,
        ...data
      };
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to read Excel files from Drive" });
  }
});

// 🔹 START SERVER
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
