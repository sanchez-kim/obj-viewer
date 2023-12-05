# OBJ file viewer

- load and view 3D mesh(obj files) with lip vertices
- packaged via electron

## Dependency

- Node.js v16.16.0에서 작업하였음.

## Quick Start

```bash
npm install
npm run start
```

## Standalone App

```bash
npm run package
```

- 커맨드를 실행하면 `release-builds` 폴더 내 `objviewer-win32-x64`가 생성된다.
- `objviewer.exe`를 실행시키면 된다.
- 메쉬 표시가 잘 되지 않을경우, canvas size, camera setting 등 조절 필요

## Lip Vertex 검수

```bash
node eval.js
```

- 코드상의 modelNum의 값을 1~10으로 변경해가며 검수하면 됨
- 검수 진행 로그는 log.txt에 기록됨
- 이상이 없는 파일에 대해서는 All clear로 기록되며 그 이외에 오류가 발생하는지를 체크하면 됨
