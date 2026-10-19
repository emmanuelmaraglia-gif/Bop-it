const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
initializeApp();
const db = getFirestore();
const fields = ["facil", "normal", "dificil"];

exports.refreshHallSnapshot = onSchedule({ schedule: "30 7 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" }, async () => {
  const meta = db.collection("meta").doc("snapshot");
  const current = await meta.get();
  // Não inicia o ciclo por conta própria: primeira pontuação válida cria o snapshot.
  if (!current.exists) return;
  const rankings = {};
  for (const field of fields) {
    const snap = await db.collection("players").where(field, ">", 0).orderBy(field, "desc").limit(10).get();
    rankings[field] = snap.docs.map(doc => ({ n: doc.get("name") || "Jogador", s: Number(doc.get(field) || 0) })).filter(x => x.s > 0);
  }
  await meta.set({ data: JSON.stringify(rankings), t: FieldValue.serverTimestamp() }, { merge: true });
});
