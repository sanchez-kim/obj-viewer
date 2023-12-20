const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
require('dotenv').config();


const s3 = new S3Client({ region: 'ap-northeast-2',
credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
 }
 });

// Function to download file from S3
const downloadFile = async (bucketName, key, downloadPath) => {
  const params = {
    Bucket: bucketName,
    Key: key
  };

  try{
    const command = new GetObjectCommand(params);
    const { Body } = await s3.send(command);
    const fileStream = fs.createWriteStream(downloadPath + key.split('/').pop());

    return new Promise((resolve, reject) => {
        Body.pipe(fileStream)
      .on('finish', () => {
        console.log(`File downloaded successfully at ${downloadPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.log(`Error downloading file: ${err}`);
        reject(err);
      });
    }
    )
  } catch (err){
    console.error('Error downloading file:', err)
  }
};

function extract(filename){
    const regex = /M(\d+)_S(\d+)_F(\d+)/;
    const matches = regex.exec(filename);

    if (matches) {
        // Extracting and parsing the numbers
        const modelNum = parseInt(matches[1], 10);
        const sentenceNum = parseInt(matches[2], 10);
        const frameNum = parseInt(matches[3], 10);

        return { modelNum, sentenceNum, frameNum };
    } else {
        // Return null or throw an error if the format doesn't match
        return null;
    }
}

let filename = 'M01_S0001_F068'

let {modelNum, sentenceNum, frameNum} = extract(filename);

const modelStr = modelNum.toString().padStart(2, "0");
const sentenceStr = sentenceNum.toString().padStart(4, "0");
const frameStr = frameNum.toString().padStart(3, "0");

const BUCKET_NAME = 'ins-ai-speech';
const OBJ = `reprocessed_v2/3Ddata/Model${modelNum.toString()}/Sentence${sentenceStr}/3Dmesh/M${modelStr}_S${sentenceStr}_F${frameStr}.obj`
const JSON = OBJ.replace('3Ddata', 'meta').replace('3Dmesh','Meta').replace('.obj','.json')
const DOWNLOAD_PATH = '../../errors/';

downloadFile(BUCKET_NAME, OBJ, DOWNLOAD_PATH);
downloadFile(BUCKET_NAME, JSON, DOWNLOAD_PATH);
