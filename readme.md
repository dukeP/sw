### 概念
Service workers 本质上充当Web应用程序与浏览器之间的代理服务器，也可以在网络可用时作为浏览器和网络间的代理。它们旨在（除其他之外）使得能够创建有效的离线体验，拦截网络请求并基于网络是否可用以及更新的资源是否驻留在服务器上来采取适当的动作。他们还允许访问推送通知和后台同步API。

具体概念见[MDN](https://developer.mozilla.org/zh-CN/docs/Web/API/Service_Worker_API)
#### 注意点
+ 不能访问DOM
+ 不会造成主线程阻塞
+ 完全异步，同步 API 不可用
+ 只能由HTTPS承载(或本机地址)
+ cacheStorage 不能缓存 POST PUT 之类的请求
### 用途
+ 离线应用
+ 页面缓存
+ 接口缓存

### 用法
#### 注册
```js
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((reg) => {
      console.log(reg)
    })
    .catch(e => {
      console.log(e)
    })
}
```
> `ServiceWorkerContainer.register()` 接收的第一个参数，url 是相对于 origin 的，不是相对于当前文件的路径，所以对于使用的 webpack 打包的项目，需要将 `sw.js` 移动到打包后的文件夹（dist）中的对应路径。可使用 `copyWebpackPlugin` 配置如下:
```js
module.exports = {
    entry: {
        //...
    },
    output: {
        //...
    },
    // ...
    plugins: [
        //...
          new CopyWebpackPlugin([
      {
        from: path.join(__dirname, '../src/serviceWorker/sw.js'),
        // 移动 sw.js 到 dist 目录下
        // 此时 worker 的相对路径就正确了
        to: path.join(__dirname, 'dist/')
      }
    ]),
    
    ]
}

```

#### 文件缓存
使用 `caches` 它使我们可以存储网络响应发来的资源，并且根据它们的请求来生成key。这个 API 和浏览器的标准的缓存工作原理很相似，但是是特定你的域的。它会一直持久存在，直到你告诉它不再存储，你拥有全部的控制权。

详见[MDN](https://developer.mozilla.org/zh-CN/docs/Web/API/Cache)

由于使用 `caches` 缓存数据时需要确定的响应（确定的资源名称）,对于 webpack 打包的项目文件资源可能是 `0.45ccdb74330a135fcca7.js` 这样带有hash串的，我们无法预先确定。需要引入 `serviceworker-webpack-plugin` 
```js
npm install serviceworker-webpack-plugin -D
```
同时配置 `webpack`
```js
module.exports = {
    //...
    plugins: [
    //...
      new ServiceWorkerWebpackPlugin({
        entry: path.join(__dirname, '../src/serviceWorker/sw.js'),
        // 这里用来配置哪些文件不需要缓存
        excludes: ['**/.*', '**/*.map', '*.html', '**.hot-update.json', 'sockjs-node/**']
        })
    ]
}
```

该插件帮助我们在 `sw.js` 定义一个全局变量 `serviceWorkerOption` 
此时，便可以获取相关参数了
```js
global.serviceWorkerOption;
// {assets: []}
```

具体用法参照代码


#### 接口缓存
对于数据量较大且不经常变动的接口请求可以对其进行缓存。这里采用 `indexedDB` 保存数据。

为了方便操作 `indexedDB` 引入了 `dexie` 库。[dexie](https://dexie.org/)可以简化我们的操作。


#### 注意
在 `service worker` 的 `fetch` 中需要使用 `FetchEvent.respondWith()` 来返回对应请求。[相关文档](https://developer.mozilla.org/zh-CN/docs/Web/API/FetchEvent)

### TODO
+ 定时清理缓存
+ post 请求的缓存问题
