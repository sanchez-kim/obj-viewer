import trimesh
import numpy as np

# Load the mesh
mesh = trimesh.load("./frame0000.obj")

# Get the vertex data
vertices_trimesh = mesh.vertices

# Print to console or save to a file
print(vertices_trimesh)

# Optionally, to save to a file:
np.savetxt("vertices_trimesh.txt", vertices_trimesh)
