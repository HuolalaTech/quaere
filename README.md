<br>
<br>

<p align="center">
  <a aria-label="NPM version" href="https://quaere-site.vercel.app">
    <img alt="" src="https://raw.githubusercontent.com/liaoliao666/quaere-site/main/assets/logo.svg" height="40">
  </a>
</p>

<br>

<p align="center">
  <a aria-label="NPM version" href="https://www.npmjs.com/package/quaere">
    <img alt="" src="https://badgen.net/npm/v/quaere">
  </a>
   <a href="https://unpkg.com/browse/quaere@latest/build/umd/index.production.js" rel="nofollow"><img src="https://img.badgesize.io/https:/unpkg.com/quaere@latest/build/umd/index.production.js?label=gzip%20size&compression=gzip" alt="gzip size"></a>
  <a href="https://github.com/liaoliao666/react-query-kit"><img src="https://badgen.net/npm/types/react-query-kit" alt="Types included" target="\_parent"></a>
  <a href="https://www.npmjs.com/package/quaere"><img src="https://badgen.net/npm/license/quaere" alt="License" target="\_parent"></a>
  <a href="https://github.com/HuolalaTech/quaere"><img src="https://img.shields.io/github/stars/HuolalaTech/quaere.svg?style=social&amp;label=Star" alt="GitHub Stars" target="\_parent"></a>
</p>

## 介绍

"Quaere" 是拉丁语中的一个词，与 query 语义相似。

Quaere 的核心实现来自于 [Tanstack Query](https://github.com/tanstack/query)，但去除了 `queryKey` 概念，API 设计类似于 [Jotai](https://github.com/pmndrs/jotai)，提供了一套声明式的、原子化的状态管理方案，帮助你高效地管理服务端状态。

类型安全地管理异步状态，并立即拥有以下特性：

- **极速**、**轻量**、**可重用的** 数据请求
- 内置 **缓存** 和重复请求去除
- **实时** 体验
- 传输和协议不可知
- 支持 SSR / ISR / SSG
- 支持 TypeScript
- React Native

Quaere 涵盖了性能，正确性和稳定性的各个方面，以帮你建立更好的体验：

- 快速页面导航
- 间隔轮询
- 数据依赖
- 聚焦时重新验证
- 网络恢复时重新验证
- 本地缓存更新 (Optimistic UI)
- 智能错误重试
- 分页和滚动位置恢复
- React Suspense

以及 [更多](https://quaere-site.vercel.app/docs/getting-started)。

---

<br/>

## Quick Start

下面是一个最基本的示例：

```ts
import { query } from 'quaere'

const anQuery = query({
  fether: variables => axios.get(url, variables),
})
```

```ts
import { useQuery } from 'quaere'

function Example() {
  const { data } = useQuery({ query: anQuery, variables })
}
```

上面的示例展示了 Quaere 的两个核心函数：

- query：用于创建一个异步资源解析配置，我们称其为 "查询配置"。

- useQuery：该 hook 用于读取 "查询配置" 发起请求，并且每个不同 `variables` 都会返回与其相应的服务端状态。

该示例中，`query` 接受一个函数 `fetcher`。`fetcher` 可以是任何返回数据的异步函数，你可以使用原生的 fetch 或 Axios 之类的工具。

---

**查看完整的文档和示例，请访问 [quaere-site.vercel.app](https://quaere-site.vercel.app).**

<br/>

## License

The MIT License.
