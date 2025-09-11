# Noxt.js Middleware

**A lightweight, file-based JSX router for Express with zero dependency on React.** 🚀

Noxt.js allows you to build server-rendered applications using JSX templating and a simple, file-based routing system. It's designed to be intuitive, flexible, and easy to integrate into any Express project.

See the source on GitHub: [noxt-js-middleware](https://github.com/zocky/noxt-js-middleware)

## Key Features

* **File-Based Routing:** `.jsx` files that export a `route` are automatically registered as pages.

* **JSX without React:** Use the power and readability of JSX for your server-side templates.

* **Async Data Loading:** Fetch data for your pages before they render using a simple `params` export.

* **Shared Context:** Easily pass global data, utilities, and components to your entire application.

## Basic Setup

First, install the package:

```js
npm install noxt-js-middleware

```

Then, integrate it with your Express app. Noxt will scan the specified `directory`, register all pages and components, and return a router instance.

```js
import express from 'express';
import noxt from 'noxt-js-middleware';

const app = express();

// Initialize the Noxt router
const noxtRouter = await noxt({
  // The directory where your .jsx files live
  directory: 'views',

  // An object that will be available to all components and pages
  context: {
    appName: 'My Awesome App',
    utils: {
      // Your helper functions
      formatDate: (date) => new Date(date).toLocaleDateString(),
    }
  }
});

// Use the router with your Express app
app.use(noxtRouter);

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

```

## Core Concepts

### Components

Any `.jsx` file found in the `directory` is treated as a **Component**.

* **Naming:** The component's name is its filename (e.g., `UserInfo.jsx` becomes `UserInfo`). It must start with a capital letter and be unique.

* **Export:** The component function must be the `default` export.

* **Signature:** The function receives two arguments: `(props, context)`.

  * `props`: An object containing the props passed to the component in JSX.

  * `context`: The global `context` object you defined, plus a reference to all other registered components. You can destructure other components directly from this object.

**Example: `views/components/Article.jsx`**

```js
// This component can be sync or async
// Notice how we destructure 'utils' and 'UserInfo' from the context (the second argument).
export default function Article({ article }, { utils, UserInfo }) {
  return (
    <article className="article-body">
      <h2>{article.title}</h2>
      <p>Published on: {utils.formatDate(article.publishDate)}</p>
      <UserInfo user={article.author} />
    </article>
  );
}

```

### Pages

A **Page** is simply a Component that also exports a `route` constant. These are the entry points for incoming requests.

Page components receive the same arguments as regular components, but their `context` object contains additional request-specific properties:

* `req`: The Express request object.

* `res`: The Express response object.

* `query`: An object containing the URL query parameters.

## Page Configuration

You can configure a page's behavior using special named exports within the `.jsx` file.

### `route`

This required export defines the URL path(s) for the page. It can be a single string or an array of strings. The route will be registered as a `GET` handler.

```js
// A single route
export const route = '/';

// Multiple routes pointing to the same page
export const route = ['/event/:id', '/data/events/:id'];

```

### `params` (Data Loading)

This optional export lets you fetch and prepare data *before* your page component renders. The final result is passed as the `props` to your page component. There are two powerful strategies for defining `params`.

#### Strategy 1: Object-based `params`

If you export `params` as an object, each key will become a prop. If a key's value is a function, it will be `await`ed, and its resolved value will be used.

The functions are resolved **sequentially**, so a later function can access the value of a previously resolved one.

**Example: `views/pages/Event.jsx`**

In this example, notice how the `EventPage` component destructures the `UserInfo` component from its context object (`{ UserInfo }`) and then uses it in the return statement (`<UserInfo ... />`).

```js
// Define the route for this page
export const route = '/event/:eventId';

// Define data dependencies for the page
export const params = {
  // `eventId` from the route is automatically available
  event: async ({ eventId }, { utils }) => {
    // Fetch event data using a utility from the context
    return await utils.fetchEvent(eventId);
  },
  // This function can use the result of the `event` fetch above
  mainUser: async ({ event }) => {
    return await fetchUser(event.mainContactId);
  }
};

// The page component receives the resolved `event` and `mainUser` as props.
// It also destructures the `UserInfo` component from context to use for rendering.
export default function EventPage({ event, mainUser }, { UserInfo }) {
  return (
    <div>
      <h1>{event.name}</h1>
      <p>Event Contact:</p>
      <UserInfo user={mainUser} />
    </div>
  );
}

```

#### Strategy 2: Function-based `params`

If you export `params` as a single function, you get full control over the final props object. The function is called with the route parameters and the context, and its return value is merged with the route parameters to become the page's props.

This is useful for more complex data-fetching logic.

```js
export const route = '/event/:eventId';

export const params = async (routeParams, context) => {
  const event = await context.utils.fetchEvent(routeParams.eventId);
  const comments = await context.utils.fetchComments(routeParams.eventId);

  // The returned object becomes the props for the page
  return {
    eventData: event,
    commentList: comments,
    // You can pass functions through as props if needed
    onAction: () => console.log('Action!')
  };
};

export default function EventPage({ eventData, commentList, onAction }) {
  // ... render the page
}

```