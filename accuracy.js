const THREE = require("three");
let objLoader;
async function loadOBJLoader() {
  if (!objLoader) {
    const module = await import("three/examples/jsm/loaders/OBJLoader.js");
    objLoader = module.OBJLoader;
  }
  return objLoader;
}
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { logger } = require("./logger");

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

// Function to generate S3 URLs with proper zero-padding
function generateS3Url(modelNum, sentenceNum, frameNum, fileType) {
  const modelStr = modelNum.toString().padStart(2, "0");
  const sentenceStr = sentenceNum.toString().padStart(4, "0");
  const frameStr = frameNum.toString().padStart(3, "0");

  return `https://ins-ai-speech.s3.ap-northeast-2.amazonaws.com/prod/v2/M${modelStr}/S${sentenceStr}/F${frameStr}/M${modelStr}_S${sentenceStr}_F${frameStr}.${fileType}`;
}

async function fetchFileFromS3(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file from S3: ${error}`);
    throw error;
  }
}

async function processFilePairs(objUrl, jsonUrl) {
  let objFileName;
  let jsonFileName;
  try {
    const objContent = await fetchFileFromS3(objUrl);
    const jsonContent = await fetchFileFromS3(jsonUrl);
    const result = await loadFiles(objContent, jsonContent);

    objFileName = path.basename(objUrl);
    jsonFileName = path.basename(jsonUrl);

    if (!result) {
      logger(`Skipping pair due to error: ${objFileName}, ${jsonFileName}`);
      return { passed: false };
    }

    const { passed, details } = checkVertices(
      result.lipIndices,
      result.lipMask1,
      result.lipMask2,
      objFileName,
      jsonFileName
    );

    if (!passed) {
      logger(
        `Vertices outside masks for pair: ${objFileName}, ${jsonFileName}`
      );
    }

    return { passed };
  } catch (error) {
    logger(
      `Error processing file pair: ${objFileName}, ${jsonFileName} - ${error}`
    );
    return { passed: false };
  }
}

// Function to load OBJ and JSON files
async function loadFiles(objContent, jsonContent) {
  try {
    const OBJLoader = await loadOBJLoader();
    const loader = new OBJLoader();
    try {
      const object = loader.parse(objContent);
      // Process the loaded object
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry;
          geometry.computeBoundingBox();
          const centroid = new THREE.Vector3();
          geometry.boundingBox.getCenter(centroid);
          geometry.translate(-centroid.x, -centroid.y, -centroid.z);
          geometry.computeVertexNormals();
        }
      });

      // Extract vertex positions and lip indices
      const vertices = object.children[0].geometry.attributes.position.array;
      const lipIndices = JSON.parse(jsonContent)["3d_data"]["lip_vertices"];
      const outLip = [12974, 7024, 21433, 18424, 7007];

      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

      outLip.forEach((index) => {
        if (index >= 0 && index < vertices.length) {
          const vertex = vertices[index];
          min.min(vertex);
          max.max(vertex);
        } else {
          logger(`Vertex index ${index} is out of bounds`);
        }
      });

      const box = new THREE.Box3(min, max);
      const lipMask1 = addPixelPaddingNoCam(box.clone(), 50, 40, 0);
      const lipMask2 = addPixelPaddingNoCam(box.clone(), 100, 80, 0);

      // Return relevant data if needed
      return { object, vertices, lipIndices, lipMask1, lipMask2 };
    } catch (error) {
      logger(`Error processing: ${error}`);
      return null;
    }
  } catch (error) {
    logger(`An error occurred loading OBJLoader: ${error}`);
    throw error; // Rethrow the error to handle it in the calling context
  }
}

// Function to check if lip vertices are within the bounding box
function checkVertices(
  lipIndices,
  lipMask1,
  lipMask2,
  objFileName,
  jsonFileName
) {
  let details = {
    outsideLipMask1: [],
    outsideLipMask2: [],
    totalCount: Object.keys(lipIndices).length,
  };

  Object.entries(lipIndices).forEach(([key, vertexArray]) => {
    const vertex = new THREE.Vector3(...vertexArray);
    if (!lipMask1.containsPoint(vertex)) {
      details.outsideLipMask1.push(key);
    }
    if (!lipMask2.containsPoint(vertex)) {
      details.outsideLipMask2.push(key);
    }
  });

  if (
    details.outsideLipMask1.length > 0 ||
    details.outsideLipMask2.length > 0
  ) {
    logger(`Some vertices are outside the lip masks!`);
    logger(`Filenames: ${objFileName}, ${jsonFileName}`);
    logger(`Vertices outside lipMask1: ${details.outsideLipMask1.length}`);
    logger(`Vertices outside lipMask2: ${details.outsideLipMask2.length}`);
    logger(`Vertices outside lipMask1: ${details.outsideLipMask1.join(", ")}`);
    logger(`Vertices outside lipMask2: ${details.outsideLipMask2.join(", ")}`);
  } else if (details.totalCount < 4410) {
    logger(`Total lip indices is less than 4410!`);
    logger(`Filenames: ${objFileName}, ${jsonFileName}`);
    logger(`Total lip indices: ${details.totalCount}`);
  } else {
    logger(`All clear for ${objFileName}, ${jsonFileName}!`);
  }

  return {
    passed:
      details.outsideLipMask1.length === 0 &&
      details.outsideLipMask2.length === 0,
    details,
  };
}

const lastProcessedFileName = "";

async function main() {
  const modelNum = 7;
  try {
    for (let sentenceNum = 3001; sentenceNum <= 3500; sentenceNum++) {
      for (let frameNum = 0; frameNum <= 300; frameNum++) {
        const objUrl = generateS3Url(modelNum, sentenceNum, frameNum, "obj");
        const jsonUrl = generateS3Url(modelNum, sentenceNum, frameNum, "json");

        console.log(objUrl, jsonUrl);

        const currentFileName = path.basename(objUrl);
        if (currentFileName === lastProcessedFileName) {
          // Start processing from this file
          await processFilePairs(objUrl, jsonUrl);
        } else if (!lastProcessedFileName) {
          await processFilePairs(objUrl, jsonUrl);
        }
      }
    }
  } catch (error) {
    logger(`Error in main: ${error}`);
  }
}

main();
