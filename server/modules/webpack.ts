import { join } from "node:path";
import { defineNitroModule } from "nitropack/kit";
import webpack from "webpack";
import { fromNodeMiddleware, defineEventHandler } from "h3";
import WebpackHotMiddleware from "webpack-hot-middleware";
import wdm, { ReadStream } from "webpack-dev-middleware";
import HtmlWebpackPlugin from "html-webpack-plugin";

export default defineNitroModule({
  setup(nitro) {
    console.log("Setting up webpack module");

    // Prepare dist dir
    const wpDist = join(nitro.options.buildDir, "webpack");
    nitro.options.publicAssets.push({
      dir: wpDist,
      baseURL: "/",
      fallthrough: true,
      maxAge: 0,
    });

    // Webpack config
    const webpackConfig = {
      mode: "development",
      devtool: false,
      entry: {
        main: [
          "webpack-hot-middleware/client?path=/__webpack_hmr&timeout=20000&reload=true",
          "./app/index.js",
        ],
      },
      plugins: [
        new HtmlWebpackPlugin({ title: "Development" }),
        new webpack.HotModuleReplacementPlugin(),
      ],
      output: {
        filename: "[name].bundle.js",
        libraryTarget: "umd",
        path: wpDist,
        publicPath: "/",
        clean: true,
      },
      optimization: { runtimeChunk: "single" },
    } satisfies webpack.Configuration;

    // Init webpack
    const compiler = webpack(webpackConfig);

    // Enable dev middleware
    const devMiddleware = wdmH3Wrapper(compiler);
    nitro.options.devHandlers.push({ handler: devMiddleware });

    // Enable hot middleware
    const hotMiddleware = WebpackHotMiddleware(compiler, {
      log: console.log,
      path: "/__webpack_hmr",
      heartbeat: 10 * 1000,
    });
    nitro.options.devHandlers.push({
      handler: fromNodeMiddleware(hotMiddleware),
    });
  },
});

function wdmH3Wrapper(compiler, options?) {
  const devMiddleware = wdm(compiler, options);
  return defineEventHandler(async (event) => {
    event.context.webpack = {
      ...event.context.webpack,
      devMiddleware: devMiddleware.context,
    };
    const { req, res } = event.node;
    const body = await new Promise((resolve, reject) => {
      // @ts-ignore
      res.stream = (stream: ReadStream) => {
        resolve(stream);
      };
      // @ts-ignore
      res.send = (data: string | Buffer) => {
        resolve(data);
      };
      // @ts-ignore
      res.finish = (data?: string | Buffer) => {
        resolve(data);
      };
      devMiddleware(req, res, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(undefined);
        }
      });
    });
    if (body !== undefined) {
      console.log("[wdm]", event.path);
      return body;
    }
  });
}
