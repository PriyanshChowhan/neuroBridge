import { asynchandler } from "../utils/asynchandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.js";
const verifyJwt= asynchandler(async(req,res,next)=>{
     const bearerToken = req.get("authorization")?.replace(/^Bearer\s+/i, "");
     const accessToken = req.cookies?.accessToken || bearerToken;
     if (!accessToken) {
        return res.status(401).json({ success: false, message: "Authentication required" });
     }

     try {
        const token = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET_KEY);
        const user = await User.findById(token._id).select("-password -refreshToken");
        if (!user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        req.user = user;
        next();
     } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid or expired session" });
     }

})


export default verifyJwt;
