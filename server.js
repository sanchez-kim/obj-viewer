const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(cors());

app.get("/list-obj-files", (req, res) => {
  const objDir = path.join(__dirname, "public/assets/obj");
  fs.readdir(objDir, (err, files) => {
    if (err) {
      console.error(err);
      res.status(500).send("Server Error");
      return;
    } else {
      const objFiles = files.filter((file) => file.endsWith("obj"));
      res.json({ files: objFiles });
    }
  });
});

app.listen(port, () => {
  console.log(`Server is listening at http://localhost:${port}`);
});
