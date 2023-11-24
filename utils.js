import * as THREE from "three";

async function extractVertexPositions(filePath, objectPosition) {
  const response = await fetch(filePath);
  const text = await response.text();
  const lines = text.split("\n");

  const vertices = [];

  for (const line of lines) {
    if (line.startsWith("v ")) {
      const parts = line.split(" ").map(parseFloat).slice(1);
      const vertex = new THREE.Vector3(...parts);
      vertex.add(objectPosition);
      vertices.push(vertex);
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

function handleError(error, message) {
  console.error(message, error);
  alert(message); // Alert with the provided message
}

function addPixelPadding(originalBox, camera, renderer, pixelPadX, pixelPadY) {
  // Properly clone the box to avoid modifying the original
  let paddedBox = originalBox.clone();

  // Get the center of the box
  let center = new THREE.Vector3();
  paddedBox.getCenter(center);

  // Project the center of the box to the screen
  let centerScreen = center.clone().project(camera);

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
    // Expand the box by the padding vectors
    paddedBox.min.add(paddingDistanceMin);
    paddedBox.max.add(paddingDistanceMax);

    // Additional check to ensure the box has not been inverted
    if (paddedBox.isEmpty()) {
      console.warn("Padded box is empty or inverted.");
      return paddedBox; // Return the original box in case of an issue
    }
  } else {
    console.warn("Padding is causing the box to invert or has no size.");
    return paddedBox;
  }

  return paddedBox;
}

function addPixelPaddingNoCam(box, paddingX, paddingY, paddingZ, scale) {
  let paddedBox = box;
  let paddingVector = new THREE.Vector3(
    paddingX * scale,
    paddingY * scale,
    paddingZ * scale
  );

  // console.log(
  //   `Before padding: min = ${paddedBox.min.toArray()}, max = ${paddedBox.max.toArray()}`
  // );
  paddedBox.min.sub(paddingVector);
  paddedBox.max.add(paddingVector);
  // console.log(
  //   `After padding: min = ${paddedBox.min.toArray()}, max = ${paddedBox.max.toArray()}`
  // );

  return paddedBox;
}

export {
  extractVertexPositions,
  getLipIndices,
  getLipIndicesFromJson,
  handleError,
  addPixelPadding,
  addPixelPaddingNoCam,
};
