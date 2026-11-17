const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const nativeWindConfig = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});

// Artefatos nativos do Gradle/CMake podem conter milhares de arquivos e não
// fazem parte do bundle JavaScript. Aplicar o blockList depois do NativeWind
// evita que o Metro monitore android/.cxx e node_modules/*/android/.cxx.
nativeWindConfig.resolver.blockList = [
  /\/android\/(?:.*\/)?\.cxx\/.*/,
  /\/android\/(?:.*\/)?build\/.*/,
  /\/android\/\.gradle\/.*/,
  /\/\.gradle\/.*/,
];

module.exports = nativeWindConfig;
