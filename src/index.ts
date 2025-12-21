import express from 'express';
import cors from 'cors';
import { userRouter } from './routes/user.routes.js';
import { adminRouter } from './routes/admin.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/users', userRouter);
app.use('/api/admin', adminRouter);


app.get("/", (req, res) => {
    res.send("API is running...");
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
