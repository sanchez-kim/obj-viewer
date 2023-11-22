import * as THREE from "three";
import { OBJLoader } from "OBJLoader";

import {
  extractVertexPositions,
  getLipIndices,
  getLipIndicesFromJson,
  handleError,
  addPixelPadding,
} from "./utils.js";

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
camera.position.set(0, -0.4, 18);
camera.fov = 8;
camera.updateProjectionMatrix();
// let camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
// camera.position.set(0, -0.5, 5);
// camera.updateProjectionMatrix();

// lighting option
const light = new THREE.DirectionalLight(0xffffff, 2.0);
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
  const overlayCanvas = document.getElementById("overlay_canvas");
  overlayCanvas.width = canvas.width;
  overlayCanvas.height = canvas.height;
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
let boxes = [];
let captureNextFrame = false;

// remove previous lip vertices
function clearPreviousLip(spheres, boxes) {
  spheres.forEach((sphere) => scene.remove(sphere));
  boxes.forEach((box) => scene.remove(box));
  spheres = [];
  boxes = [];
}

async function setLibraryFolderAndLoadFiles() {
  const directoryPaths = await window.electronAPI.invoke(
    "open-directory-dialog"
  );
  if (directoryPaths && directoryPaths.length > 0) {
    const selectedDirectory = directoryPaths[0];
    await loadObjFilesFromDirectory(selectedDirectory);
  }
}

// TODO: fix the projection problem
// when projecting 3d to 2d, the box is off the lip outline
function drawBoundingBoxes(
  paddedBox,
  camera,
  renderer,
  padX,
  padY,
  color = "red"
) {
  const screenPosition = toScreenPosition(
    paddedBox,
    camera,
    renderer,
    padX,
    padY
  );

  const overlayCanvas = document.getElementById("overlay_canvas");
  const ctx = overlayCanvas.getContext("2d");
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  ctx.strokeStyle = color;
  ctx.strokeRect(
    screenPosition.x,
    screenPosition.y,
    screenPosition.width,
    screenPosition.height
  );
}

function toScreenPosition(box, camera, renderer, pixelPadX, pixelPadY) {
  if (!box || !box.min || !box.max) {
    console.error("Invalid bounding box provided to toScreenPosition");
    return;
  }

  // Calculate the factors to convert from NDC to screen space
  const halfWidth = renderer.domElement.width / 2;
  const halfHeight = renderer.domElement.height / 2;

  // Convert the 3D box min and max into NDC
  const minNDC = box.min.clone().project(camera);
  const maxNDC = box.max.clone().project(camera);

  // Convert from NDC to screen space
  let pos = {
    x: (minNDC.x + 1) * halfWidth,
    y: (-maxNDC.y + 1) * halfHeight,
    width: (maxNDC.x - minNDC.x) * halfWidth,
    height: (maxNDC.y - minNDC.y) * halfHeight,
  };

  // Apply pixel padding
  pos.x -= pixelPadX / 2;
  pos.y -= pixelPadY / 2;
  pos.width += pixelPadX;
  pos.height += pixelPadY;

  return pos;
}

function selectFile(fileItem, filePath) {
  const fileList = document.getElementById("fileList");
  Array.from(fileList.children).forEach((child) => {
    child.classList.remove("selected");
  });
  fileItem.classList.add("selected");
  loadTexture(filePath);
}

async function loadObjFilesFromDirectory(directory) {
  try {
    const fullPaths = await window.electronAPI.loadObjFiles(directory);

    const fileList = document.getElementById("fileList");
    fileList.innerHTML = ""; // Clear the previous file list

    fullPaths.forEach((fullPath) => {
      // Extract file name from the full path
      const fileName = fullPath.split("/").pop();

      const fileItem = document.createElement("div");
      fileItem.textContent = fileName;
      fileItem.addEventListener("click", () => selectFile(fileItem, fullPath));
      fileList.appendChild(fileItem);
    });
  } catch (error) {
    console.error("Error loading OBJ files from directory", error);
  }
}

async function loadTexture(filePath) {
  const textureLoader = new THREE.TextureLoader();

  textureLoader.load(
    "samples/M05.png",
    (textureImage) => {
      loadObjFile(filePath, textureImage);
    },
    undefined,
    (error) => {
      console.error("An error occurred loading the texture", error);
    }
  );
}

// removes previous OBJ and load new one
function loadObjFile(filePath, texture) {
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
          // child.material = new THREE.MeshStandardMaterial(
          //   { map: texture }
          // );

          const geometry = child.geometry;
          geometry.computeBoundingBox();
          const centroid = new THREE.Vector3();
          geometry.boundingBox.getCenter(centroid);
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

          // drawBoundingBoxes(box.clone(), camera, renderer, 0, 0, "blue");

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

document.addEventListener("DOMContentLoaded", () => {
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
});
