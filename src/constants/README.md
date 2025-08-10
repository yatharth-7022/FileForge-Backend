# Messages Constants

This directory contains centralized message constants for the application.

## Usage

Import the messages in your controllers:

```javascript
const MESSAGES = require("../constants/messages");

// Use in your controller
res.status(500).json({ message: MESSAGES.INTERNAL_SERVER_ERROR });
res.status(200).json({ message: MESSAGES.FILE_UPLOADED_SUCCESS });
```

## Benefits

1. **Consistency**: All error messages are consistent across the application
2. **Maintainability**: Easy to update messages from a single location
3. **Internationalization Ready**: Easy to add multi-language support later
4. **No Typos**: Prevents typos in repeated messages

## Adding New Messages

Add new messages to `messages.js`:

```javascript
NEW_MESSAGE: "Your new message here",
```

For dynamic messages, use functions:

```javascript
dynamicMessage: (param) => `Message with ${param}`,
```
