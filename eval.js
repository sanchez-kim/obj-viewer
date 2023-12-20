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
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

require("dotenv").config();

const s3 = new S3Client({
  region: "ap-northeast-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const { logger } = require("./logger");

let modelBoundingBox;
let modelSize;
let largestDimension;
let modelScaleFactor;

async function getRandomFilePaths(modelNum, sentenceNum) {
  const bucketName = "ins-ai-speech";
  const prefix = `reprocessed_v2/3Ddata/Model${modelNum.toString()}/Sentence${sentenceNum
    .toString()
    .padStart(4, "0")}/3Dmesh/`;

  const params = {
    Bucket: bucketName,
    Prefix: prefix,
  };

  try {
    const command = new ListObjectsV2Command(params);
    const data = await s3.send(command);
    const fileKeys = data.Contents
      ? data.Contents.map((content) => content.Key)
      : [];

    // Randomly pick 5 file paths
    let selectedFiles = [];
    while (selectedFiles.length < 5 && fileKeys.length > 0) {
      const randomIndex = Math.floor(Math.random() * fileKeys.length);
      selectedFiles.push(fileKeys.splice(randomIndex, 1)[0]);
    }

    return selectedFiles.map((filePath) =>
      generateS3Url(modelNum, sentenceNum, extractFrameNum(filePath), "obj")
    );
  } catch (error) {
    console.error("Error fetching from S3:", error);
    return [];
  }
}

function extractFrameNum(filePath) {
  const frameMatch = filePath.match(/F(\d{3})\.obj$/);
  return frameMatch ? parseInt(frameMatch[1], 10) : null;
}

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

  return `https://ins-ai-speech.s3.amazonaws.com/reprocessed_v2/3Ddata/Model${modelNum.toString()}/Sentence${sentenceStr}/3Dmesh/M${modelStr}_S${sentenceStr}_F${frameStr}.${fileType}`;
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

async function processFilePairs(objUrl, jsonPath) {
  let objFileName;

  try {
    const objContent = await loadOBJJson(objUrl);
    const objText = await loadOBJText(objUrl);

    const result = await loadFiles(objContent, objText, jsonPath);

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

async function getLipIndicesFromJson(jsonPath) {
  const fetch = (await import("node-fetch")).default;
  try {
    const response = await fetch(jsonPath);
    const data = await response.json();
    const lips = data["3d_data"]["lip_vertices"];
    return lips;
  } catch (error) {
    logger("Error fetching OBJ file:", error);
  }
}

// Function to load OBJ and JSON files
async function loadFiles(objContent, objText, jsonPath) {
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

    // const lipIndices = await getLipIndices("./assets/lip/lip_index_old.txt");

    const lipIndices = await getLipIndicesFromJson(jsonPath);
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
    totalCount: Object.keys(lipIndices).length,
    // totalCount: lipIndices.length,
  };

  // // txt 파일에서 립버텍스 인덱스만 읽어올 경우 처리 방식
  // lipIndices.forEach((index) => {
  //   if (index >= 0 && index < vertices.length) {
  //     const vertex = vertices[index];

  //     if (!lipMask1.containsPoint(vertex)) {
  //       details.outsideLipMask1.push(index);
  //     }

  //     if (!lipMask2.containsPoint(vertex)) {
  //       details.outsideLipMask2.push(index);
  //     }
  //   } else {
  //     logger(`Vertex index ${index} is out of bounds`);
  //   }
  // });

  // console.log(lipMask1);
  // console.log(lipMask1.containsPoint(new THREE.Vector3(1, 1, 1)));

  // if (!lipMask1.containsPoint(new THREE.Vector3(1, 1, 1))) {
  //   details.outsideLipMask1.push(1);
  // }

  // json 파일에서 립버텍스 인덱스 좌표를 읽어올 경우 처리 방식
  Object.keys(lipIndices).forEach((key) => {
    const index = parseInt(key);
    if (index >= 0 && index < vertices.length) {
      const vertexArray = lipIndices[index];
      const vertexVector = new THREE.Vector3(
        vertexArray[0],
        vertexArray[1],
        vertexArray[2]
      );

      if (!lipMask1.containsPoint(vertexVector)) {
        details.outsideLipMask1.push(index);
      }

      if (!lipMask2.containsPoint(vertexVector)) {
        details.outsideLipMask2.push(index);
      }
    } else {
      logger(`Vertex index ${index} is out of bounds`);
    }
  });

  const passed = details.outsideLipMask2.length === 0;

  if (details.totalCount < 4410) {
    logger(`Total lip indices is less than 4410 in ${objFileName}!`);
  } else if (details.outsideLipMask1.length > 0) {
    logger(`Some vertices outside the lipMask1: ${objFileName}`);
    logger(details.outsideLipMask1);
  } else if (details.outsideLipMask2.length > 0) {
    logger(`Some vertices outside the lipMask2: ${objFileName}`);
    logger(details.outsideLipMask2);
  } else {
    if (passed) {
      logger(`${objFileName}: PASSED`);
    } else {
      logger(`${objFileName}: FAILED`);
    }
  }

  return {
    passed,
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

async function main() {
  for (let modelNum = 1; modelNum <= 10; modelNum++) {
    try {
      if (MODELS[modelNum]) {
        const [startSentenceNum, endSentenceNum] = MODELS[modelNum];

        // Label for the outer loop
        for (
          let sentenceNum = startSentenceNum;
          sentenceNum <= endSentenceNum;
          sentenceNum++
        ) {
          const randomFilePaths = await getRandomFilePaths(
            modelNum,
            sentenceNum
          );
          randomFilePaths.sort();

          const randomJsonPaths = randomFilePaths.map((filePath) =>
            filePath
              .replace("3Ddata", "meta")
              .replace("3Dmesh", "Meta")
              .replace(".obj", ".json")
          );

          for (let i = 0; i < randomFilePaths.length; i++) {
            const filePath = randomFilePaths[i];
            const jsonPath = randomJsonPaths[i];
            try {
              const currentFileName = path.basename(filePath);
              if (
                currentFileName === lastProcessedFileName ||
                !lastProcessedFileName
              ) {
                await processFilePairs(filePath, jsonPath);
              }
            } catch (error) {
              logger(`Error processing file: ${filePath} - ${error}`);
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
}

// function extract(filename) {
//   const regex = /M(\d+)_S(\d+)_F(\d+)/;
//   const matches = regex.exec(filename);

//   if (matches) {
//     // Extracting and parsing the numbers
//     const modelNum = parseInt(matches[1], 10);
//     const sentenceNum = parseInt(matches[2], 10);
//     const frameNum = parseInt(matches[3], 10);

//     return { modelNum, sentenceNum, frameNum };
//   } else {
//     // Return null or throw an error if the format doesn't match
//     return null;
//   }
// }

// async function main() {
//   let filename = "M01_S0001_F068";

//   let { modelNum, sentenceNum, frameNum } = extract(filename);

//   const modelStr = modelNum.toString().padStart(2, "0");
//   const sentenceStr = sentenceNum.toString().padStart(4, "0");
//   const frameStr = frameNum.toString().padStart(3, "0");

//   try {
//     const filePath = `https://ins-ai-speech.s3.amazonaws.com/reprocessed_v2/3Ddata/Model${modelNum.toString()}/Sentence${sentenceStr}/3Dmesh/M${modelStr}_S${sentenceStr}_F${frameStr}.obj`;
//     const jsonPath = filePath
//       .replace("3Ddata", "meta")
//       .replace("3Dmesh", "Meta")
//       .replace(".obj", ".json"); // Path to the corresponding .json file

//     try {
//       await processFilePairs(filePath, jsonPath);
//     } catch (error) {
//       logger(`Error processing file: ${filePath} - ${error}`);
//     }
//   } catch (error) {
//     logger(`Error in main: ${error}`);
//   }
// }

main();
