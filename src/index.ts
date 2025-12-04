import express from 'express';
import cors from 'cors';
import { userRouter } from './routes/user.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/users', userRouter);


app.get("/", (req, res) => {
    res.send("API is running...");
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
