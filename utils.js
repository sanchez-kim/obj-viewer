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

// return lip indices from json file
async function getLipIndicesFromJson(jsonPath) {
  const response = await fetch(jsonPath);
  const data = await response.json();
  const lips = data["3d_data"]["lip_vertices"];
  return lips;
}

// remove previous lip vertices
function clearPreviousLip(spheres, boxes) {
  spheres.forEach((sphere) => scene.remove(sphere));
  boxes.forEach((box) => scene.remove(box));
  spheres = [];
  boxes = [];
}

function handleError(error, message) {
  console.error(message, error);
  alert(message); // Alert with the provided message
}

function addPixelPadding(box, camera, renderer, pixelPadX, pixelPadY) {
  // Clone the box to avoid modifying the original
  let paddedBox = box;

  // Get the center of the box
  let center = new THREE.Vector3();
  paddedBox.getCenter(center);

  // Project the center of the box to the screen
  let centerScreen = center.clone().project(camera);

  // Calculate the dimensions of the renderer's canvas
  let widthHalf = 0.5 * renderer.domElement.clientWidth;
  let heightHalf = 0.5 * renderer.domElement.clientHeight;

  // Convert pixel padding to NDC space (Normalized Device Coordinates)
  let paddingXNDC = (pixelPadX / renderer.domElement.clientWidth) * 2;
  let paddingYNDC = (pixelPadY / renderer.domElement.clientHeight) * 2;

  // Unproject the corners of the NDC padding box from screen to world space
  let paddingMin = new THREE.Vector3(
    centerScreen.x - paddingXNDC,
    centerScreen.y - paddingYNDC,
    centerScreen.z
  ).unproject(camera);
  let paddingMax = new THREE.Vector3(
    centerScreen.x + paddingXNDC,
    centerScreen.y + paddingYNDC,
    centerScreen.z
  ).unproject(camera);

  // Calculate padding distance by subtracting center
  let paddingDistanceMin = paddingMin.sub(center);
  let paddingDistanceMax = paddingMax.sub(center);

  // Ensure padding does not invert the box
  if (paddingDistanceMin.lengthSq() > 0 && paddingDistanceMax.lengthSq() > 0) {
    // Add the padding to the box min and max
    paddedBox.min.add(paddingDistanceMin);
    paddedBox.max.add(paddingDistanceMax);
  } else {
    // Handle potential inversion if necessary
    console.warn("Padding is causing the box to invert or has no size.");
  }

  return paddedBox;
}

function addPixelPaddingNoCam(box, paddingX, paddingY, paddingZ) {
  // Clone the box to avoid modifying the original
  let paddedBox = box.clone();

  // Calculate padding in world space
  let paddingVector = new THREE.Vector3(paddingX, paddingY, paddingZ);

  // Add the padding to the box min and max
  paddedBox.min.sub(paddingVector);
  paddedBox.max.add(paddingVector);

  return paddedBox;
}

module.exports = {
  extractVertexPositions,
  getLipIndices,
  getLipIndicesFromJson,
  clearPreviousLip,
  handleError,
  addPixelPadding,
  addPixelPaddingNoCam,
};
