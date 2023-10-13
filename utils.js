const THREE = require("three");

async function extractVertexPositions(filePath) {
  const response = await fetch(filePath);
  const text = await response.text();
  const lines = text.split("\n");

  const vertices = [];

  for (const line of lines) {
    if (line.startsWith("v ")) {
      const parts = line.split(" ").map(parseFloat).slice(1);
      vertices.push(new THREE.Vector3(...parts));
    }
  }
  return vertices;
}

async function getLipIndices(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error("Network response was not ok " + response.statusText);
    }
    const text = await response.text();
    return text.trim().split(",").map(Number);
  } catch (error) {
    console.error("There has been a problem", error);
  }
}

module.exports = {
  extractVertexPositions,
  getLipIndices,
};
