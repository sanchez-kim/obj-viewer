import pygame
from OpenGL.GL import *
from OpenGL.GLU import *
import numpy as np

vertices = []
faces = []

with open("./Retopology Mesh.obj", "r") as f:
    for line in f:
        stripped_line = line.strip()
        if not stripped_line:
            continue

        components = stripped_line.strip().split()
        if components[0] == "v":
            vertices.append([float(c) for c in components[1:]])
        elif components[0] == "f":
            faces.append([int(c.split("/")[0]) - 1 for c in components[1:]])

with open("./lip_vertices_idx.txt", "r") as f:
    lip_vertex_indices = [int(item.strip()) for item in f.read().split(",")]

print("Num of Lip Vertex Indices:", len(lip_vertex_indices))

lip_vertex = {}
for item in lip_vertex_indices:
    lip_vertex[item] = vertices[item]
print(len(lip_vertex))

# Initialize Pygame and OpenGL
pygame.init()
display = (800, 600)
pygame.display.set_mode(display, pygame.DOUBLEBUF | pygame.OPENGL)
gluPerspective(60, display[0] / display[1], 0.1, 50.0)
glTranslatef(0.0, -7.0, -15)

glRotatef(0, 0, 180, 1)


# Rendering loop
while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            quit()

    # Clear the buffer
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)

    # Draw the 3D mesh
    glBegin(GL_TRIANGLES)
    for face in faces:
        for vertex in face:
            if vertex in lip_vertex_indices:
                glColor3f(1, 0, 0)
            else:
                glColor3f(1, 1, 1)
            glVertex3fv(vertices[vertex])
    glEnd()

    # Get the transformation matrix
    modelview_matrix = glGetFloatv(GL_MODELVIEW_MATRIX)
    projection_matrix = glGetFloatv(GL_PROJECTION_MATRIX)

    # Project the lip vertices to 2D and highlight them
    for i in lip_vertex_indices:
        vertex_3d = vertices[i]
        vertex_4d = np.append(vertex_3d, 1.0)
        vertex_2d = np.dot(projection_matrix, np.dot(modelview_matrix, vertex_4d))
        vertex_2d = vertex_2d / vertex_2d[3]

        # Convert normalized device coordinates to window coordinates
        x = int((vertex_2d[0] * 0.5 + 0.5) * display[0])
        y = int((-vertex_2d[1] * 0.5 + 0.5) * display[1])

        # Draw a small circle at the projected 2D position
        pygame.draw.circle(pygame.display.get_surface(), (255, 0, 0), (x, y), 5)
        # ... (use vertex_2d to draw a 2D marker at the projected position)

    # Swap the buffers to display the rendered image
    pygame.display.flip()
    pygame.time.wait(10)
