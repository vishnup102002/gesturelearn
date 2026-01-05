# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

GestureLearn is a web-based collaborative learning platform designed to enhance online education by integrating computer vision with standard video conferencing tools. Unlike traditional platforms that rely on a mouse, keyboard, or stylus for interaction, GestureLearn introduces a touch-free, gesture-based air drawing mechanism. 


This system allows instructors to draw and annotate directly over their live video stream using simple finger movements, creating a more natural and engaging teaching environment without the need for expensive hardware like smart boards or tablets. 




🚀 Key Features
** gesture-Based Air Drawing:** Instructors can write and annotate on the screen using hand gestures detected via webcam. 


Touch-Free Interaction: Eliminates the need for physical input devices like a mouse or stylus for board work. 




Live Video & Audio: Full video conferencing capabilities powered by WebRTC. 




Real-Time Collaboration: Supports synchronized drawing overlays and live chat for seamless teacher-student interaction. 



Draw Mode Control: Features to toggle draw mode ON/OFF and select different colors for annotation. 


Session Management: Teachers can create classrooms and students can join via a shared room ID or link. 

🛠️ Tech Stack
This project utilizes a modern web development stack combined with advanced computer vision libraries:

Frontend

React.js: User interface and component management. 

HTML/CSS/JavaScript: Core web technologies. 

MediaPipe Hands: For real-time hand tracking and gesture recognition in the browser. 

Backend

Node.js (Express.js): Server-side application logic. 

Socket.IO: Real-time, bidirectional communication for signaling and drawing synchronization. 

Real-Time Media & Database

WebRTC: Peer-to-peer audio and video streaming. 

SQLite: Lightweight database for managing session data. 

❓ Problem Statement
Traditional online learning platforms often limit natural teaching methods because they rely heavily on standard input devices. Smart boards and specialized stylus tablets are expensive and not accessible to everyone. There is a critical need for a low-cost, device-independent solution that allows for intuitive, touch-free explanation and interaction in virtual classrooms. 



🎯 Objectives
To design and develop a gesture-based online learning system. 

To enable touch-free screen annotation using finger gestures over a live video feed. 

To support real-time collaboration between teachers and students. 

To improve student engagement and interactivity in virtual learning environments. 

⚙️ Installation & Run
(Based on the tech stack provided)

Clone the repository:

Bash
git clone https://github.com/your-username/GestureLearn.git
cd GestureLearn
Install Backend Dependencies:

Bash
cd backend
npm install
Install Frontend Dependencies:

Bash
cd ../frontend
npm install
Start the Application:

Backend: npm start (Runs on port 5001)

Frontend: npm start (Runs on port 3000)

📄 License