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

  { name: "RFT-1&2", fileId: "1ut8udLSw4XmewBw7dVjWFsM-HL77kLXO", type: "RFT" },
  { name: "RFT-3&4", fileId: "1s8jUgqu7ypDi3dE3n5qQsUMco9uC331d", type: "RFT" },
  { name: "RFT-5&6", fileId: "1LurYup84SSTQnq5L754ahMLM0Xr03Mf_", type: "RFT" },

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

/* 🔴 THIS FUNCTION WAS MISSING */
function readExcelFromBuffer(buffer, type) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const base = {
    wheelCode: clean(sheet["B7"]?.v),
    wheelSize: clean(sheet["B8"]?.v),
    testReason: clean(sheet["B37"]?.v),
  };

  if (type === "CFT") {
    return {
      ...base,
      bendingMovement: clean(sheet["B30"]?.v),
      testLoad: null,
    };
  }

  return {
    ...base,
    bendingMovement: null,
    testLoad: clean(sheet["B20"]?.v),
  };
}

/* ================= ROUTES ================= */

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/api/dashboard-data", async (req, res) => {
  try {
    const result = {};

    for (const file of FILES) {
      const buffer = await downloadExcel(file.fileId);
      const data = readExcelFromBuffer(buffer, file.type);

      result[file.name] = {
        machine: file.name,
        ...data,
      };
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read Excel files" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
