export default {
  server: {
    proxy: {
      "/.netlify/functions/list-obj": {
        target: "http://localhost:8888",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/\.netlify\/functions\//, "/"),
      },
    },
  },
};
