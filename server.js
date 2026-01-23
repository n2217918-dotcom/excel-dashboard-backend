import { useState, useEffect } from "react";

function App() {
  /* ================= LOGIN ================= */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [error, setError] = useState("");

  /* ================= MACHINE STATE ================= */
  const [machineInputs, setMachineInputs] = useState({
    "CFT-1": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
    "CFT-2": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
    "CFT-3": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
    "RFT-1&2": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
    "RFT-3&4": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
    "RFT-5&6": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
    "BI AXIAL-CV": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
    "BI AXIAL-LP": { wheelCode: "", wheelSize: "", cycles: "", load: "", testReason: "" },
  });

  /* ================= FETCH BACKEND ================= */
  useEffect(() => {
    if (!isLoggedIn) return;

    fetch("https://excel-dashboard-backend-q2nl.onrender.com/api/dashboard-data")
      .then((res) => res.json())
      .then((data) => {
        const updated = { ...machineInputs };

        /* ---------- CFT ---------- */
        ["CFT-1", "CFT-2", "CFT-3"].forEach((k) => {
          if (!data[k]) return;
          updated[k] = {
            ...updated[k],
            wheelCode: data[k].wheelCode || "",
            wheelSize: data[k].wheelSize || "",
            testReason: data[k].testReason || "",
            load: data[k].bendingMovement || "",
          };
        });

        /* ---------- BI AXIAL ---------- */
        ["BI AXIAL-CV", "BI AXIAL-LP"].forEach((k) => {
          if (!data[k]) return;
          updated[k] = {
            ...updated[k],
            wheelCode: data[k].wheelCode || "",
            wheelSize: data[k].wheelSize || "",
            testReason: data[k].testReason || "",
            load: data[k].testLoad || "",
          };
        });

        /* ---------- RFT GROUPING (FIXED) ---------- */
        const rft1 = data["RFT-1"];
        const rft2 = data["RFT-2"];
        const rft3 = data["RFT-3"];

        if (rft1 && rft2) {
          updated["RFT-1&2"] = {
            ...updated["RFT-1&2"],
            wheelCode: `${rft1.wheelCode}, ${rft2.wheelCode}`,
            wheelSize: rft1.wheelSize,
            testReason: rft1.testReason,
            load: rft1.testLoad,
          };
        }

        if (rft3) {
          updated["RFT-3&4"] = {
            ...updated["RFT-3&4"],
            wheelCode: rft3.wheelCode,
            wheelSize: rft3.wheelSize,
            testReason: rft3.testReason,
            load: rft3.testLoad,
          };

          /* 🔥 THIS WAS MISSING */
          updated["RFT-5&6"] = {
            ...updated["RFT-5&6"],
            wheelCode: rft3.wheelCode,
            wheelSize: rft3.wheelSize,
            testReason: rft3.testReason,
            load: rft3.testLoad,
          };
        }

        setMachineInputs(updated);
      })
      .catch((err) => console.error("Backend error:", err));
  }, [isLoggedIn]);

  /* ================= MACHINE CONFIG ================= */
  const machines = [
    { name: "CFT-1", type: "CFT", sub: "10 KN", img: "/images/cft1_2.png" },
    { name: "CFT-2", type: "CFT", sub: "60 KN", img: "/images/cft1_2.png" },
    { name: "CFT-3", type: "CFT", sub: "105 KN", img: "/images/cft3.png" },
    { name: "RFT-1&2", type: "RFT", sub: "3 TON", img: "/images/rft1_2.png" },
    { name: "RFT-3&4", type: "RFT", sub: "10 TON", img: "/images/rft3_4.png" },
    { name: "RFT-5&6", type: "RFT", sub: "10 & 15 TON", img: "/images/rft5_6.png" },
    {
      name: "BI AXIAL-CV",
      type: "BIAXIAL",
      subLines: ["VERTICAL 250 KN", "LATERAL ±100 KN"],
      img: "/images/biaxial_cv.png",
    },
    {
      name: "BI AXIAL-LP",
      type: "BIAXIAL",
      subLines: ["VERTICAL 40 KN", "LATERAL ±40 KN"],
      img: "/images/biaxial_lp.png",
    },
  ];

  /* ================= LOGIN ================= */
  const login = (e) => {
    e.preventDefault();
    if (username === "wil" && password === "123456") {
      setIsLoggedIn(true);
      setError("");
    } else setError("Invalid credentials");
  };

  const logout = () => {
    setIsLoggedIn(false);
    setUsername("");
    setPassword("");
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.loginPage}>
        <form style={styles.loginCard} onSubmit={login}>
          <h2>Login</h2>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <input style={styles.loginInput} placeholder="Username"
            value={username} onChange={(e) => setUsername(e.target.value)} />
          <input style={styles.loginInput} type="password" placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button style={styles.loginButton}>Login</button>
        </form>
      </div>
    );
  }

  return (
    <div style={styles.dashboard}>
      <div style={styles.header}>
        <h2>WHEELS INDIA LIMITED</h2>
        <button style={styles.logoutBtn} onClick={logout}>Logout</button>
      </div>

      <div style={styles.grid}>
        {machines.map((m) => {
          const loadLabel = m.type === "CFT" ? "Bending Movement" : "Test Load";
          return (
            <div key={m.name} style={styles.card}>
              <div style={styles.machineName}>{m.name}</div>
              <img src={m.img} alt={m.name} style={styles.image} />
              {["wheelCode","wheelSize","cycles","load","testReason"].map((k) => (
                <input key={k} style={styles.input} value={machineInputs[m.name][k]} readOnly />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= STYLES ================= */
const styles = {
  dashboard: { padding: 20 },
  header: { display: "flex", justifyContent: "space-between" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 },
  card: { background: "#fff", padding: 12, borderRadius: 12 },
  image: { width: 120 },
  input: { width: "100%", marginBottom: 6 },
  machineName: { fontWeight: "bold" },
  loginPage: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center" },
  loginCard: { background: "#fff", padding: 20, borderRadius: 8 },
  loginInput: { width: "100%", marginBottom: 10 },
  loginButton: { width: "100%" },
  logoutBtn: { background: "red", color: "white" }
};

export default App;
