const THREE = require("three");
let OBJLoader;
(async function () {
  const module = await import("OBJLoader");
  OBJLoader = module.OBJLoader;
})();
const { extractVertexPositions, getLipIndices } = require("./utils.js");
const ipcRenderer = require("electron").ipcRenderer;

const scene = new THREE.Scene();
const canvas = document.getElementById("webgl_canvas");
const aspectRatio = canvas.width / canvas.height;
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  preserveDrawingBuffer: true,
});
renderer.setSize(canvas.width, canvas.height); // set window size
renderer.setClearColor(0xffffff); // set background color

const camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
// for real data
// camera.position.set(0, 155, 100);
// camera.fov = 18;

// for sample data
// camera.position.set(0, 8, 280);
// camera.lookAt(0, 0, 0);
// camera.fov = 6;

camera.position.set(0, -4, 20);
camera.lookAt(0, 0, 0);
camera.fov = 10;

camera.updateProjectionMatrix();

const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(1, 1, 1).normalize();
scene.add(light);

window.addEventListener("resize", function () {
  const newAspectRatio = canvas.width / canvas.height;
  camera.aspect = newAspectRatio;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.width, canvas.height);
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);

  if (captureNextFrame) {
    captureImage();
    captureNextFrame = false;
  }
}

let currentObj = null;
let spheres = [];
let show = true;
let boxHelper;
let extendedBoxHelper;
let boxWithoutPaddingHelper;
let boxes = [];
let captureNextFrame = false;

async function setLibraryFolderAndLoadFiles() {
  const directoryPaths = await ipcRenderer.invoke("open-directory-dialog");
  console.log("Directory paths received: ", directoryPaths);
  if (directoryPaths && directoryPaths.length > 0) {
    const selectedDirectory = directoryPaths[0];
    loadObjFilesFromDirectory(selectedDirectory);
  }
}

function loadObjFilesFromDirectory(directory) {
  const fs = require("fs");
  const path = require("path");

  fs.readdir(directory, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }

    const objFiles = files.filter(
      (file) => path.extname(file).toLowerCase() === ".obj"
    );

    const fileList = document.getElementById("fileList");
    fileList.innerHTML = ""; // Clear the previous file list

    objFiles.forEach((objFile) => {
      const filePath = path.join(directory, objFile);

      const fileItem = document.createElement("div");
      fileItem.textContent = objFile;
      fileItem.addEventListener("click", () => {
        Array.from(fileList.children).forEach((child) => {
          child.classList.remove("selected");
        });
        fileItem.classList.add("selected");
        loadObjFile(filePath); // Now loading from local directory
      });

      fileList.appendChild(fileItem);
    });
  });
}

// remove previous lip vertices
function clearPreviousLip() {
  spheres.forEach((sphere) => scene.remove(sphere));
  boxes.forEach((box) => scene.remove(box));
  spheres = [];
  boxes = [];
}

function create2DOutlineFromBox3(box, color) {
  const vertices = [
    new THREE.Vector3(box.min.x, box.min.y, 0),
    new THREE.Vector3(box.max.x, box.min.y, 0),
    new THREE.Vector3(box.max.x, box.max.y, 0),
    new THREE.Vector3(box.min.x, box.max.y, 0),
  ];

  // Connect vertices to form a rectangle
  const indices = [0, 1, 1, 2, 2, 3, 3, 0];

  const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
  geometry.setIndex(indices);

  const material = new THREE.LineBasicMaterial({
    color: color,
    depthTest: false,
  });

  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.renderOrder = 2; // Ensure it's always rendered on top

  return lineSegments;
}

// removes previous OBJ and load new one
function loadObjFile(filePath) {
  console.log(filePath);
  if (currentObj) {
    scene.remove(currentObj);
    clearPreviousLip();
  }

  function apply2DPadding(min, max, camera, pixelPadX, pixelPadY, renderer) {
    // Convert 3D coordinates to 2D
    const min2D = min.clone().project(camera);
    const max2D = max.clone().project(camera);

    // Convert pixel padding to NDC space
    const paddingXInNDC = (pixelPadX / renderer.domElement.width) * 2;
    const paddingYInNDC = (pixelPadY / renderer.domElement.height) * 2;

    // Apply padding
    min2D.x -= paddingXInNDC;
    min2D.y -= paddingYInNDC;
    max2D.x += paddingXInNDC;
    max2D.y += paddingYInNDC;

    // Convert back to 3D
    const paddedMin = min2D.unproject(camera);
    const paddedMax = max2D.unproject(camera);

    return [paddedMin, paddedMax];
  }

  const loader = new OBJLoader();
  loader.load(
    filePath,
    async (object) => {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry;
          geometry.computeBoundingBox();
          const centroid = new THREE.Vector3();
          geometry.boundingBox.getCenter(centroid);
          geometry.translate(-centroid.x, -centroid.y, -centroid.z);
          geometry.computeVertexNormals(); // Ensure the vertices are up-to-date

          child.renderOrder = 1;
        }
      });

      scene.add(object); // add new obj to the scene
      currentObj = object; // update the reference to the currently displayed obj

      animate();

      Promise.all([
        extractVertexPositions(filePath),
        getLipIndices("public/lip_index.txt"),
        getLipIndices("public/lip_outline_index.txt"),
      ])
        .then(([vertices, lipIndices, outLip]) => {
          // Create a bounding box using the lip outline indices
          const min = new THREE.Vector3(Infinity, Infinity, Infinity);
          const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

          outLip.forEach((index) => {
            if (index >= 0 && index < vertices.length) {
              const vertex = vertices[index];
              min.min(vertex);
              max.max(vertex);
            } else {
              console.error(`Vertex index ${index} is out of bounds`);
            }
          });

          lipIndices.forEach((index) => {
            if (index >= 0 && index < vertices.length) {
              const vertex = vertices[index];
              const sphereGeometry = new THREE.SphereGeometry(0.003, 16, 16);
              const sphereMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
              });
              const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
              sphere.position.copy(vertex);
              scene.add(sphere);
              spheres.push(sphere);
            } else {
              console.error(`Vertex index ${index} is out of bounds`);
            }
          });
          animate();

          // // Yellow color for standard box
          // const boxWithoutPadding = new THREE.Box3(min, max);
          // boxWithoutPaddingHelper = new THREE.Box3Helper(
          //   boxWithoutPadding,
          //   0xffd133
          // );
          // scene.add(boxWithoutPaddingHelper);

          const horizontal = 8;
          const vertical = 12;

          const [minWithPadding, maxWithPadding] = apply2DPadding(
            min,
            max,
            camera,
            horizontal,
            vertical,
            renderer
          );

          const [extendedMin, extendedMax] = apply2DPadding(
            minWithPadding,
            maxWithPadding,
            camera,
            horizontal,
            vertical,
            renderer
          );

          const box = new THREE.Box3(minWithPadding, maxWithPadding);
          const extendedBox = new THREE.Box3(extendedMin, extendedMax);

          boxHelper = create2DOutlineFromBox3(box, 0x33ff45);
          extendedBoxHelper = create2DOutlineFromBox3(extendedBox, 0xff33ce);

          boxHelper.material.depthTest = false;
          extendedBoxHelper.material.depthTest = false;

          boxHelper.renderOrder = 2;
          extendedBoxHelper.renderOrder = 2;

          scene.add(boxHelper);
          scene.add(extendedBoxHelper);

          boxes.push(boxHelper);
          boxes.push(extendedBoxHelper);
        })
        .catch((error) => {
          console.error("An error occurred: ", error);
        });
    },
    (xhr) => {
      // loading progress
      console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    (error) => {
      console.error("An error occurred", error);
    }
  );
}

function captureImage() {
  var saveCanvas = document.getElementById("webgl_canvas");
  var dataURL = saveCanvas.toDataURL("image/png");

  var tempLink = document.createElement("a");
  tempLink.href = dataURL;
  tempLink.setAttribute("download", "screen.png");
  tempLink.click();
}

document
  .getElementById("selectDirectory")
  .addEventListener("click", setLibraryFolderAndLoadFiles);

document.getElementById("toggleVertices").addEventListener("click", () => {
  show = !show;
  spheres.forEach((sphere) => (sphere.visible = show));
});

document.getElementById("toggleBoundingBox").addEventListener("click", () => {
  show = !show;
  boxHelper.visible = show;
  extendedBoxHelper.visible = show;
  boxWithoutPaddingHelper.visible = show;
});

document.getElementById("downloadBtn").addEventListener("click", function () {
  captureNextFrame = true;
});
