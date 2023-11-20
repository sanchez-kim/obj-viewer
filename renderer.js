const THREE = require("three");
let OBJLoader;
(async function () {
  const module = await import("OBJLoader");
  OBJLoader = module.OBJLoader;
})();

const {
  extractVertexPositions,
  getLipIndices,
  getLipIndicesFromJson,
  clearPreviousLip,
  handleError,
  addPixelPadding,
} = require("./utils.js");
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

// camera info
const camera = new THREE.PerspectiveCamera(75, aspectRatio, 0.1, 1000);
camera.position.set(0, -0.5, 15);
camera.fov = 8;
camera.updateProjectionMatrix();

// lighting option
const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(0, 0, 1);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(ambientLight);

window.addEventListener("resize", function () {
  const newAspectRatio = canvas.width / canvas.height;
  camera.aspect = newAspectRatio;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.width, canvas.height);

  // Resize overlay canvas
  const overlayCanvas = document.getElementById('overlay_canvas');
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);

  if (currentObj && showBox) {
    drawBoundingBoxes(currentObj, camera, renderer);
  }

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

function drawBoundingBoxes(obj, camera, renderer) {
  const screenPosition = toScreenPosition(obj, camera, renderer);

  const overlayCanvas = document.getElementById('overlay_canvas');
  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  ctx.strokeStyle = 'red';
  ctx.strokeRect(screenPosition.x, screenPosition.y, screenPosition.width, screenPosition.height);
}

function toScreenPosition(obj, camera, renderer) {
  const vector = new THREE.Vector3();

  // Get the bounding box of the object
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);

  // Get the center of the bounding box
  box.getCenter(vector);

  // Project the center point to 2D
  vector.project(camera);

  // Convert from normalized device coordinates (NDC) to screen space
  vector.x = Math.round((0.5 + vector.x / 2) * renderer.domElement.width);
  vector.y = Math.round((0.5 - vector.y / 2) * renderer.domElement.height);

  return {
      x: vector.x - size.x / 2,
      y: vector.y - size.y / 2,
      width: size.x,
      height: size.y
  };
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

// removes previous OBJ and load new one
function loadObjFile(filePath) {
  console.log(filePath);
  if (currentObj) {
    scene.remove(currentObj);
    clearPreviousLip(spheres, boxes);

    // Hide the bounding box
    if (boxHelper) boxHelper.visible = false;
    if (extendedBoxHelper) extendedBoxHelper.visible = false;
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
          geometry.computeVertexNormals();

          child.renderOrder = 1;
        }
      });

      scene.add(object);

      currentObj = object; // update the reference to the currently displayed obj

      animate();

      const jsonPath = filePath.replace(".obj", ".json");

      Promise.all([
        extractVertexPositions(filePath),
        getLipIndicesFromJson(jsonPath)
          .then((lipIndices) => {
            return lipIndices;
          })
          .catch((error) => {
            handleError(
              error,
              "해당하는 JSON 파일을 찾지못했습니다.\n 파일이 존재하는지 확인하십시오."
            );
            throw error;
          }),
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

          // JSON 파일에서 인덱스 좌표를 불러올 경우 립버텍스 처리 방식
          Object.keys(lipIndices).forEach((key) => {
            const vertexArray = lipIndices[key];
            const vertex = new THREE.Vector3(...vertexArray);
            const sphereGeometry = new THREE.SphereGeometry(0.003, 16, 16); // 립버텍스 점 크기가 넘무 작으면 이것을 조절
            const sphereMaterial = new THREE.MeshBasicMaterial({
              color: 0xff0000, // 점 색깔
            });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.copy(vertex);
            scene.add(sphere);
            spheres.push(sphere);
          });
          animate();

          const box = new THREE.Box3(min, max);

          // 바운딩 박스 패딩 설정
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
});

document.getElementById("downloadBtn").addEventListener("click", function () {
  captureNextFrame = true;
});
