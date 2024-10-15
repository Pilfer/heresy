const path = require('path');

module.exports = {
  entry: './src/hermes_agent/index.ts',
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: '_hermes_agent.js',
    path: path.resolve(__dirname, '../../dist'),
  },
};