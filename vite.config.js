export default {
  server: {
    proxy: {
      "/list-obj-files": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
};
