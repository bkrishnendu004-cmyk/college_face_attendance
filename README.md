# College AI Face Recognition Attendance System

## GitHub Pages 404 না আসার নিয়ম
1. `index.html` অবশ্যই repository-র **root**-এ থাকবে (zip খুলে ভেতরের ফাইলগুলো upload করো, `site` ফোল্ডারসহ নয়)।
2. GitHub → Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / folder: **/(root)** → Save।
3. 1-2 মিনিট অপেক্ষা করো, তারপর `https://USERNAME.github.io/REPO-NAME/` খোলো।
4. সব path relative (`css/style.css`, `js/auth.js`) এবং ফাইলের নাম ছোট হাতের অক্ষরে — GitHub case-sensitive।
5. `.nojekyll` ফাইলটা রাখো (hidden file, মুছো না)।

## Firebase setup (project: face-attendance-system-2f0b5)
1. `js/firebase-config.js`-এ `apiKey`, `messagingSenderId`, `appId` বসাও (Console → Project settings → Your apps)।
2. Authentication → Sign-in method → **Email/Password** enable করো।
3. Authentication → Settings → **Authorized domains**-এ `USERNAME.github.io` যোগ করো (না করলে login কাজ করবে না)।
4. Firestore Database তৈরি করো, তারপর `firestore.rules`-এর লেখা Rules ট্যাবে paste করে Publish করো।
5. প্রথম Admin: Authentication → Users → Add user। তার UID কপি করে Firestore-এ `users/{UID}` document বানাও:
   `role: "admin"`, `name: "Admin"`, `email: "..."`, `status: "Active"`
6. Admin দিয়ে login → Teachers, Classes, Students যোগ করো → Face Registration → Settings থেকে Principal account বানাও।
