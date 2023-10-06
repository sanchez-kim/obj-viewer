import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { extractVertexPositions, getLipIndices } from "./utils.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight); // set window size
renderer.setClearColor(0xffffff); // set background color
document.body.appendChild(renderer.domElement);

camera.position.z = 2; // set camera position
camera.fov = 36; // lower the size becomes larger
camera.updateProjectionMatrix();

const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(1, 1, 1).normalize();
scene.add(light);

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

let showVertices = true;
let currentObj = null;
let spheres = [];
let boxHelper;
let extendedBoxHelper;
let boxes = [];
const defaultObj = "/netlify/functions/obj/frame0000.obj";

// remove previous lip vertices
function clearPreviousLip() {
  spheres.forEach((sphere) => scene.remove(sphere));
  boxes.forEach((box) => scene.remove(box));
  spheres = [];
  boxes = [];
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
      scene.add(object); // add new obj to the scene
      currentObj = object; // update the reference to the currently displayed obj

      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry;
          geometry.computeVertexNormals(); // Ensure the vertices are up-to-date
        }
      });
      animate();

      Promise.all([
        extractVertexPositions(filePath),
        getLipIndices("lip_index.txt"),
        getLipIndices("lip_outline_index.txt"),
      ])
        .then(([vertices, lipIndices, outLip]) => {
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
              const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16);
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

          const boxWithoutPadding = new THREE.Box3(min, max);
          const boxWithoutPaddingHelper = new THREE.Box3Helper(
            boxWithoutPadding,
            0xffd133
          ); // Yellow color for standard box

          const paddingForBox = new THREE.Vector3(0.8, 1, 0); // 80px horizontally and 100px vertically

          const minWithPadding = min.clone().sub(paddingForBox);
          const maxWithPadding = max.clone().add(paddingForBox);

          const box = new THREE.Box3(minWithPadding, maxWithPadding);
          boxHelper = new THREE.Box3Helper(box, 0x33ff45); // Green color for first padded box

          const additionalPaddingForExtendedBox = new THREE.Vector3(0.8, 1, 0); // Additional 80px horizontally and 100px vertically

          const extendedMin = minWithPadding
            .clone()
            .sub(additionalPaddingForExtendedBox);
          const extendedMax = maxWithPadding
            .clone()
            .add(additionalPaddingForExtendedBox);

          const extendedBox = new THREE.Box3(extendedMin, extendedMax);
          extendedBoxHelper = new THREE.Box3Helper(extendedBox, 0xff33ce); // Green color for extended padded box

          scene.add(boxWithoutPaddingHelper);
          scene.add(boxHelper);
          scene.add(extendedBoxHelper);

          boxes.push(boxWithoutPaddingHelper);
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

const objLinks = [
  "https://ins-ai-speech.s3.ap-northeast-2.amazonaws.com/tmp/frame0000.obj",
  "https://ins-ai-speech.s3.ap-northeast-2.amazonaws.com/tmp/frame0021.obj",
  "https://ins-ai-speech.s3.ap-northeast-2.amazonaws.com/tmp/frame0030.obj",
  "https://ins-ai-speech.s3.ap-northeast-2.amazonaws.com/tmp/frame0038.obj",
];

objLinks.forEach((link) => {
  const fileName = link.split("/").pop(); // Extract the filename from the URL

  const fileItem = document.createElement("div");
  fileItem.textContent = fileName;
  fileItem.addEventListener("click", () => {
    Array.from(fileList.children).forEach((child) => {
      child.classList.remove("selected");
    });
    fileItem.classList.add("selected");
    loadObjFile(link); // Now directly using the public link to load the OBJ
  });

  fileList.appendChild(fileItem);
});

const objFileList = document.getElementById("fileList");
const defaultFileDiv = [...objFileList.children].find(
  (div) => div.textContent === "frame0000.obj"
);
if (defaultFileDiv) {
  defaultFileDiv.classList.add("selected");
  loadObjFile("https://your-s3-bucket-url/path-to-your-default-object.obj"); // Load default OBJ on page load
} else {
  console.error("Default file not found");
}

// always load default (initial) obj file
loadObjFile(defaultObj);

document.getElementById("toggleVertices").addEventListener("click", () => {
  showVertices = !showVertices;
  spheres.forEach((sphere) => (sphere.visible = showVertices));
});

document.getElementById("toggleBoundingBox").addEventListener("click", () => {
  const showBoundingBox = boxHelper.visible;
  boxHelper.visible = !showBoundingBox;
  extendedBoxHelper.visible = !showBoundingBox;
});
