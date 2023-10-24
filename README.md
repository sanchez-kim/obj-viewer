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
