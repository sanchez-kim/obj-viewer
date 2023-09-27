const fs = require("fs");
const path = require("path");

exports.handler = async (event, context) => {
  try {
    const objDir = path.join(__dirname, "../../public/assets/obj");
    const files = fs
      .readdirSync(objDir)
      .filter((file) => file.endsWith(".obj"));
    return {
      statusCode: 200,
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
