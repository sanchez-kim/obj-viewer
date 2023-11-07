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
camera.fov = 6;

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
let showVertex = true;
let showBox = true;
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

// return lip indices from json file
async function getLipIndicesFromJson(jsonPath) {
  const response = await fetch(jsonPath);
  const data = await response.json();
  const lips = data["3d_data"]["lip_vertices"];
  return lips;
}

// remove previous lip vertices
function clearPreviousLip() {
  spheres.forEach((sphere) => scene.remove(sphere));
  boxes.forEach((box) => scene.remove(box));
  spheres = [];
  boxes = [];
}

function handleError(error, message) {
  console.error(message, error);
  alert(message); // Alert with the provided message
}

function addPixelPadding(box, camera, renderer, pixelPadX, pixelPadY) {
  // Clone the box to avoid modifying the original
  let paddedBox = box.clone();

  // Get the center of the box
  let center = new THREE.Vector3();
  paddedBox.getCenter(center);

  // Project the center of the box to the screen
  let centerScreen = center.clone().project(camera);

  // Calculate the dimensions of the renderer's canvas
  let widthHalf = 0.5 * renderer.domElement.clientWidth;
  let heightHalf = 0.5 * renderer.domElement.clientHeight;

  // Convert pixel padding to NDC space (Normalized Device Coordinates)
  let paddingXNDC = (pixelPadX / renderer.domElement.clientWidth) * 2;
  let paddingYNDC = (pixelPadY / renderer.domElement.clientHeight) * 2;

  // Unproject the corners of the NDC padding box from screen to world space
  let paddingMin = new THREE.Vector3(
    centerScreen.x - paddingXNDC,
    centerScreen.y - paddingYNDC,
    centerScreen.z
  ).unproject(camera);
  let paddingMax = new THREE.Vector3(
    centerScreen.x + paddingXNDC,
    centerScreen.y + paddingYNDC,
    centerScreen.z
  ).unproject(camera);

  // Calculate padding distance by subtracting center
  let paddingDistanceMin = paddingMin.sub(center);
  let paddingDistanceMax = paddingMax.sub(center);

  // Ensure padding does not invert the box
  if (paddingDistanceMin.lengthSq() > 0 && paddingDistanceMax.lengthSq() > 0) {
    // Add the padding to the box min and max
    paddedBox.min.add(paddingDistanceMin);
    paddedBox.max.add(paddingDistanceMax);
  } else {
    // Handle potential inversion if necessary
    console.warn("Padding is causing the box to invert or has no size.");
  }

  return paddedBox;
}

// removes previous OBJ and load new one
function loadObjFile(filePath) {
  console.log(filePath);
  if (currentObj) {
    scene.remove(currentObj);
    clearPreviousLip();
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

      scene.add(object);

      currentObj = object; // update the reference to the currently displayed obj

      animate();

      const jsonPath = filePath.replace(".obj", ".json");

      Promise.all([
        extractVertexPositions(filePath),
        getLipIndices("public/lip_index.txt"),
        // getLipIndices("public/lip_index_new.txt"),

        // getLipIndicesFromJson(jsonPath)
        //   .then((lipIndices) => {
        //     return lipIndices;
        //   })
        //   .catch((error) => {
        //     handleError(
        //       error,
        //       "해당하는 JSON 파일을 찾지못했습니다.\n 파일이 존재하는지 확인하십시오."
        //     );
        //     throw error;
        //   }),

        getLipIndices("public/lip_outline_index.txt"),
        // getLipIndices("public/lip_outline_index.txt"),
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

          // txt 파일에서 립버텍스 인덱스만 읽어올 경우 처리 방식
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

          // // JSON 파일에서 인덱스 좌표를 불러올 경우 립버텍스 처리 방식
          // Object.keys(lipIndices).forEach((key) => {
          //   const vertexArray = lipIndices[key];
          //   const vertex = new THREE.Vector3(...vertexArray);
          //   const sphereGeometry = new THREE.SphereGeometry(0.003, 16, 16);
          //   const sphereMaterial = new THREE.MeshBasicMaterial({
          //     color: 0xff0000,
          //   });
          //   const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          //   sphere.position.copy(vertex);
          //   scene.add(sphere);
          //   spheres.push(sphere);
          // });
          animate();

          const box = new THREE.Box3(min, max);

          let paddedBox = addPixelPadding(
            box.clone(),
            camera,
            renderer,
            50,
            40
          );
          let paddedBox2 = addPixelPadding(
            box.clone(),
            camera,
            renderer,
            100,
            80
          );

          boxHelper = new THREE.Box3Helper(paddedBox, 0x33ff45);
          extendedBoxHelper = new THREE.Box3Helper(paddedBox2, 0xff33ce);

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
  showVertex = !showVertex;
  spheres.forEach((sphere) => (sphere.visible = showVertex));
});

document.getElementById("toggleBoundingBox").addEventListener("click", () => {
  showBox = !showBox;
  boxHelper.visible = showBox;
  extendedBoxHelper.visible = showBox;
  // boxWithoutPaddingHelper.visible = show;
});

document.getElementById("downloadBtn").addEventListener("click", function () {
  captureNextFrame = true;
});
