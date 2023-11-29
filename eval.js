const THREE = require("three");
let objLoader;
async function loadOBJLoader() {
  if (!objLoader) {
    const module = await import("three/examples/jsm/loaders/OBJLoader.js");
    objLoader = module.OBJLoader;
  }
  return objLoader;
}
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const { logger } = require("./logger");

let modelBoundingBox;
let modelSize;
let largestDimension;
let modelScaleFactor;

async function getLipIndices(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return data
      .trim()
      .split(",")
      .map((num) => parseInt(num, 10)); // Convert to numbers and adjust for zero-based indexing
  } catch (error) {
    console.error("There has been a problem reading the file: ", error);
    throw error;
  }
}

function addPixelPaddingNoCam(box, paddingX, paddingY, paddingZ, scale) {
  let paddedBox = box;
  let paddingVector = new THREE.Vector3(
    paddingX * scale,
    paddingY * scale,
    paddingZ * scale
  );

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

async function loadOBJText(url) {
  const fetch = (await import("node-fetch")).default;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const text = await response.text();
    return text;
  } catch (error) {
    console.error("Error fetching OBJ file:", error);
  }
}

async function loadOBJJson(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching file from url: ${error}`);
    throw error;
  }
}

async function processFilePairs(objUrl) {
  let objFileName;

  try {
    const objContent = await loadOBJJson(objUrl);
    const objText = await loadOBJText(objUrl);

    const result = await loadFiles(objContent, objText);

    objFileName = path.basename(objUrl);

    if (!result) {
      logger(`Skipping pair due to error: ${objFileName}`);
      return { passed: false };
    }

    const { passed, details } = checkVertices(
      result.vertices,
      result.lipIndices,
      result.lipMask1,
      result.lipMask2,
      objFileName
    );

    if (!passed) {
      logger(`Vertices outside masks for: ${objFileName}`);
    }

    return { passed };
  } catch (error) {
    logger(`Error processing file: ${objFileName} - ${error}`);
    return { passed: false };
  }
}

async function extractVertex(objText, objectPosition) {
  const vertices = [];

  const lines = objText.split("\n");

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

// Function to load OBJ and JSON files
async function loadFiles(objContent, objText) {
  try {
    const OBJLoader = await loadOBJLoader();
    const loader = new OBJLoader();
    const object = loader.parse(objContent);

    modelBoundingBox = new THREE.Box3().setFromObject(object);
    // console.log("Model Bounding Box: ", modelBoundingBox);
    modelSize = modelBoundingBox.getSize(new THREE.Vector3());
    // console.log("Model Size: ", modelSize);

    largestDimension = Math.max(modelSize.x, modelSize.y, modelSize.z);
    // console.log("Largest Dimension: ", largestDimension);

    modelScaleFactor = largestDimension / 1000;
    // console.log("Model Scale Factor: ", modelScaleFactor);

    // Get the center of the bounding box
    let center = modelBoundingBox.getCenter(new THREE.Vector3());

    // Translate the object to center it
    object.position.sub(center);

    const vertices = await extractVertex(objText, object.position);

    const lipIndices = await getLipIndices("./assets/lip/lip_index_old.txt");
    const outLip = await getLipIndices("./assets/lip/lip_outline_old.txt");
    // const outLip = [12974, 7024, 21433, 18424, 7007];

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

    const lipMask1 = addPixelPaddingNoCam(
      box.clone(),
      50,
      40,
      100,
      modelScaleFactor
    );
    const lipMask2 = addPixelPaddingNoCam(
      box.clone(),
      100,
      80,
      100,
      modelScaleFactor
    );

    return {
      vertices,
      lipIndices,
      lipMask1,
      lipMask2,
    };
  } catch (error) {
    logger(`Error in loadFiles: ${error}`);
    throw error;
  }
}

// Function to check if lip vertices are within the bounding box
function checkVertices(vertices, lipIndices, lipMask1, lipMask2, objFileName) {
  let details = {
    outsideLipMask1: [],
    outsideLipMask2: [],
    totalCount: lipIndices.length,
  };
  // console.log("length of vertices: ", vertices.length);
  // console.log("lipmask 1: ", lipMask1);
  // console.log(
  //   "lipmask contains point: ",
  //   lipMask1.containsPoint(new THREE.Vector3(1, 1, 1))
  // );

  // console.log("vertices 20000: ", vertices[20000]);
  // console.log(
  //   "lipmask contains point: ",
  //   lipMask1.containsPoint(vertices[20000])
  // );

  lipIndices.forEach((index) => {
    if (index >= 0 && index < vertices.length) {
      const vertex = vertices[index];

      if (!lipMask1.containsPoint(vertex)) {
        details.outsideLipMask1.push(index);
      }

      if (!lipMask2.containsPoint(vertex)) {
        details.outsideLipMask2.push(index);
      }
    } else {
      logger(`Vertex index ${index} is out of bounds`);
    }
  });

  // if (
  //   details.outsideLipMask1.length > 0 ||
  //   details.outsideLipMask2.length > 0
  // ) {
  //   logger(`Some vertices are outside the lip masks in ${objFileName}!`);
  //   // logger(`Vertices outside lipMask1: ${details.outsideLipMask1.length}`);
  //   // logger(`Vertices outside lipMask2: ${details.outsideLipMask2.length}`);
  //   // logger(`Vertices outside lipMask1: ${details.outsideLipMask1.join(", ")}`);
  //   logger(`Vertices outside lipMask2: ${details.outsideLipMask2.join(", ")}`);
  // } else if (details.totalCount < 4410) {
  //   logger(`Total lip indices is less than 4410 in ${objFileName}!`);
  //   logger(`Total lip indices: ${details.totalCount}`);
  // } else {
  //   logger(`All clear for ${objFileName}!`);
  // }
  if (details.outsideLipMask2 > 0) {
    logger(`Some vertices outside the lipMask2: ${objFileName}`);
  } else if (details.totalCount < 4410) {
    logger(`Total lip indices is less than 4410 in ${objFileName}!`);
  } else {
    logger(`All clear for ${objFileName}!`);
  }

  return {
    passed: details.outsideLipMask2.length === 0,
    details,
  };
}

const lastProcessedFileName = "";

const MODELS = {
  1: [0, 500],
  2: [501, 1000],
  3: [1001, 1500],
  4: [1501, 2000],
  5: [2006, 2500],
  6: [2501, 3000],
  7: [3001, 3500],
  8: [3501, 4000],
  9: [4001, 4500],
  10: [4501, 5000],
};
// async function main() {
//   try {
//     const modelNum = 5; // Specify the model number
//     const sentenceNum = 2001; // Specify the sentence number
//     const frameNum = 1; // Specify the frame number

//     const objUrl = generateS3Url(modelNum, sentenceNum, frameNum, "obj");
//     await processFilePairs(objUrl);
//   } catch (error) {
//     logger(`Error in main: ${error}`);
//   }
// }

async function main() {
  const modelNum = 7;
  try {
    if (MODELS[modelNum]) {
      const [startSentenceNum, endSentenceNum] = MODELS[modelNum];

      // Label for the outer loop
      sentenceLoop: for (
        let sentenceNum = startSentenceNum;
        sentenceNum <= endSentenceNum;
        sentenceNum++
      ) {
        let errorCount = 0; // Counter for consecutive errors

        for (let frameNum = 0; frameNum <= 300; frameNum++) {
          try {
            const objUrl = generateS3Url(
              modelNum,
              sentenceNum,
              frameNum,
              "obj"
            );
            const currentFileName = path.basename(objUrl);
            if (
              currentFileName === lastProcessedFileName ||
              !lastProcessedFileName
            ) {
              await processFilePairs(objUrl);
            }
          } catch (error) {
            logger(`Error processing file: ${objUrl} - ${error}`);
            errorCount += 1;

            if (errorCount > 5) {
              logger(`Skipping to next sentence after 5 consecutive errors.`);
              continue sentenceLoop;
            }
          }
        }
      }
    } else {
      logger(`Model number ${modelNum} is not defined in MODELS`);
    }
  } catch (error) {
    logger(`Error in main: ${error}`);
  }
}

main();

// https://ins-ai-speech.s3.ap-northeast-2.amazonaws.com/prod/v2/M05/S2001/F000/M05_S2001_F000.obj
