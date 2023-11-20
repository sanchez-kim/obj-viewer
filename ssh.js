const Client = require("ssh2").Client;
const fs = require("fs");
const path = require("path");
const { logger } = require("./logger");

// Directories on the remote server
const baseDir =
  "/external/ssd2/ai_team/jenny/AIdata/3dtalkingface/dataset/processed_1st/labels/3Ddata/Model6/";

// Utility function to list files in a directory with a specific extension
async function listFiles(sftp, directory, extension) {
  return new Promise((resolve, reject) => {
    sftp.readdir(directory, (err, list) => {
      if (err) {
        reject(`Error reading directory ${directory}: ${err}`);
        return;
      }
      try {
        const files = list
          .map((item) => item.filename)
          .filter((filename) => filename.endsWith(extension));
        resolve(files);
      } catch (processingError) {
        reject(
          `Error processing files in directory ${directory}: ${processingError.message}`
        );
      }
    });
  });
}

// Function to match OBJ and JSON file pairs
function matchFilePairs(objFiles, jsonFiles, objDirectory, jsonDirectory) {
  const pairs = [];
  for (const objFile of objFiles) {
    const baseName = path.basename(objFile, ".obj");
    const jsonFile = jsonFiles.find(
      (file) => path.basename(file, ".json") === baseName
    );
    if (jsonFile) {
      pairs.push({
        objFile: path.join(objDirectory, objFile),
        jsonFile: path.join(jsonDirectory, jsonFile),
      });
    } else {
      // console.log(`Missing JSON file for OBJ: ${objFile}`);
      logger(`Missing JSON file for OBJ: ${objFile}`);
    }
  }

  // Additionally, check for JSON files without corresponding OBJ files
  for (const jsonFile of jsonFiles) {
    const baseName = path.basename(jsonFile, ".json");
    const objFile = objFiles.find(
      (file) => path.basename(file, ".obj") === baseName
    );
    if (!objFile) {
      // console.log(`Missing OBJ file for JSON: ${jsonFile}`);
      logger(`Missing OBJ file for JSON: ${jsonFile}`);
    }
  }

  return pairs;
}

function createSSHConnection() {
  const sshClient = new Client();
  const connectionParams = {
    host: "192.168.1.206",
    username: "sanchez",
    privateKey: fs.readFileSync(path.join(process.env.HOME, ".ssh/id_rsa")),
  };
  return new Promise((resolve, reject) => {
    sshClient.on("ready", () => {
      // console.log("Connection Successful");
      logger("Connection Successful");
      // Use the sftp subsystem to interact with the file system
      sshClient.sftp((err, sftp) => {
        if (err) {
          // console.error("SFTP Error:", err);
          logger(`SFTP Error: ${err}`);
          reject(err);
        } else {
          resolve({ sshClient, sftp });
        }
      });
    });

    sshClient.on("error", (err) => {
      // console.error("Connection error:", err);
      logger(`Connection error: ${err}`);
      reject(err);
    });

    sshClient.on("end", () => {
      // console.log("Connection ended");
      logger("Connection ended");
    });

    sshClient.on("close", (hadError) => {
      // console.log("Connection closed", hadError ? "with error" : "");
      logger(`Connection closed ${hadError ? "with error" : ""}`);
    });

    sshClient.connect(connectionParams);
  });
}

async function getFilePairs(sftp) {
  let allPairs = [];

  for (let sentenceNumber = 2501; sentenceNumber <= 2502; sentenceNumber++) {
    let sentenceDir = `${baseDir}sentence${sentenceNumber}/`;
    const objDirectory = sentenceDir + "3Dmesh";
    const jsonDirectory = sentenceDir + "Meta";

    try {
      const objFiles = await listFiles(sftp, objDirectory, ".obj");
      const jsonFiles = await listFiles(sftp, jsonDirectory, ".json");

      objFiles.sort();
      jsonFiles.sort();

      const pairs = matchFilePairs(
        objFiles,
        jsonFiles,
        objDirectory,
        jsonDirectory
      );
      allPairs.push(...pairs);
    } catch (error) {
      // console.error(`Error processing sentence ${sentenceNumber}: ${error}`);
      logger(`Error processing sentence ${sentenceNumber}: ${error}`);
    }
  }
  return allPairs;
}

module.exports = { createSSHConnection, getFilePairs };
