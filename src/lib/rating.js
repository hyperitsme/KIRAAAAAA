export function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function suggestDifficulty(elo) {
  // Target kesulitan sedikit di atas/bawah Elo user untuk adaptif
  const wiggle = (Math.random() * 120) - 60; // ±60
  return Math.max(800, Math.round(elo + wiggle));
}
