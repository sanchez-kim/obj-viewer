import pyrender
import trimesh
import numpy as np
from PIL import Image
from pathlib import Path

# load mesh
mesh = trimesh.load("./frame0000.obj")

with open("./lip_vertices_idx_v2.txt", "r") as f:
    lip_vertex_indices = [int(item.strip()) for item in f.read().split(",")]

print("Num of Lip Vertex Indices:", len(lip_vertex_indices))

pyrender_mesh = pyrender.Mesh.from_trimesh(mesh)

scene = pyrender.Scene()
scene.add(pyrender_mesh)

# Add a lighting
light = pyrender.DirectionalLight(color=np.ones(3), intensity=3.0)
light_pose = np.eye(4)
light_pose[:3, 3] = [0, -1, -3]
scene.add(light, pose=light_pose)


# Set camera position
camera = pyrender.PerspectiveCamera(yfov=np.pi / 8.0)
camera_pose = np.eye(4)
camera_pose[:3, 3] = [0.0, 10.0, -0.1]  # Adjust the Z value to zoom in/out

# Add the camera to the scene with the specified pose
scene.add(camera, pose=camera_pose)


# Highlight the lip vertices by creating small spheres at each lip vertex location
for idx in lip_vertex_indices:
    # Create a small sphere
    sphere = trimesh.creation.uv_sphere(radius=0.04)
    sphere.visual.vertex_colors = [255, 0, 0, 255]
    sphere.vertices += mesh.vertices[idx]  # Move the sphere to the lip vertex location

    # Create a pyrender mesh for the sphere and add it to the scene
    sphere_mesh = pyrender.Mesh.from_trimesh(sphere, smooth=False)
    scene.add(sphere_mesh)


r = pyrender.OffscreenRenderer(1024, 768)
color, depth = r.render(scene)

img = Image.fromarray(color)

num = 0
while Path(f"./save/image_{num}.png").exists():
    num += 1
img.save(f"./save/image_{num}.png")

r.delete()
