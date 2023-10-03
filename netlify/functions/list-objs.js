const fs = require("fs");
const path = require("path");

exports.handler = async (event, context) => {
  console.log(path.resolve(__dirname));
  try {
    const objDir = path.join(__dirname, "obj");
    console.log(objDir);
    const files = fs
      .readdirSync(objDir)
      .filter((file) => file.endsWith(".obj"));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server Error" }),
    };
  }
};
