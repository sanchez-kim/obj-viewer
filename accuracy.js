const THREE = require("three");
let objLoader;
async function loadOBJLoader() {
  if (!objLoader) {
    const module = await import("three/examples/jsm/loaders/OBJLoader.js");
    objLoader = module.OBJLoader;
  }
  return objLoader;
}
const { addPixelPaddingNoCam } = require("./utils.js");
const { createSSHConnection, getFilePairs } = require("./ssh.js");

const fs = require("fs");
const path = require("path");
const { logger } = require("./logger");

async function fetchFileContent(sftp, filePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    sftp
      .createReadStream(filePath)
      .on("data", (chunk) => chunks.push(chunk))
      .on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
      .on("error", reject);
  });
}

async function processFilePairs(sftp, pair) {
  try {
    const objContent = await fetchFileContent(sftp, pair.objFile);
    const jsonContent = await fetchFileContent(sftp, pair.jsonFile);
    const result = await loadFiles(objContent, jsonContent);

    const objFileName = path.basename(pair.objFile);
    const jsonFileName = path.basename(pair.jsonFile);

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
      `Error processing file pair: ${path.basename(
        pair.objFile
      )}, ${path.basename(pair.jsonFile)} - ${error}`
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

const lastProcessedFileName = "M06_S2501_F000.obj";

// Main execution flow
async function main() {
  let sshClient;
  try {
    const connection = await createSSHConnection();
    sshClient = connection.sshClient;
    const sftp = connection.sftp;

    const pairs = await getFilePairs(sftp);
    let resumeProcessing = false;

    for (const pair of pairs) {
      const currentFileName = path.basename(pair.objFile);
      if (!resumeProcessing) {
        if (currentFileName === lastProcessedFileName) {
          resumeProcessing = true;
        }
        continue;
      }
      await processFilePairs(sftp, pair);
    }
    sshClient.end();
  } catch (error) {
    logger(`Error in main: ${error}`);
    if (sshClient) {
      sshClient.end();
    }
  }
}

main();
