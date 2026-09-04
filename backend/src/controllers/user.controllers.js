import { asynchandler } from "../utils/asynchandler.js";
import { User } from "../models/user.js";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.accessToken(); 
        const refreshToken = user.RefreshToken(); 

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new Error("Token generation failed. Please try again.");
    }
};

const setTokenCookies = (res, tokens) => {
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    };
    res.cookie("accessToken", tokens.accessToken, options);
    res.cookie("refreshToken", tokens.refreshToken, options);
};


const registerUser = asynchandler(async (req, res) => {
    let { username, emailId, password, phoneNumber } = req.body;

    if ([username, emailId, password].some((field) => !field || field.trim() === "")) {
        return res.status(400).json({
            success: false,
            message: "All fields are required"
        });
    }

    emailId = emailId.trim().toLowerCase();
    const existedUser = await User.findOne({
        $or: [{ username: username.toLowerCase() }, { emailId }]
    });

    if (existedUser) {
        return res.status(409).json({
            success: false,
            message: "User with this username or email already exists"
        });
    }

    const user = await User.create({
        username: username.toLowerCase(),
        emailId,
        password,
        phoneNumber,
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        return res.status(500).json({ 
            success: false,
            message: "Something went wrong while registering the user."
        });
    }

    const tokens = await generateAccessAndRefreshToken(createdUser._id);
    setTokenCookies(res, tokens);

    return res.status(201).json({ 
        success: true,
        message: "User registered and logged in successfully",
        data: {
            user: createdUser
        }
    });
});

const loginUser = asynchandler(async (req, res) => {
    let { emailId, password } = req.body;

    if (!emailId || !password) {
        return res.status(400).json({ 
            success: false,
            message: "Email and password are required"
        });
    }

    emailId = emailId.trim().toLowerCase();
    const user = await User.findOne({ emailId });

    if (!user) {
        return res.status(404).json({ 
            success: false,
            message: "User does not exist"
        });
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        return res.status(401).json({ 
            success: false,
            message: "Invalid user credentials"
        });
    }

    const tokens = await generateAccessAndRefreshToken(user._id);
    setTokenCookies(res, tokens);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

    return res.status(200).json({
        success: true,
        message: "User logged in successfully",
        data: {
            user: loggedInUser
        }
    });
});

const logoutUser = asynchandler(async (req, res) => {
    // req.user is added by your verifyJwt middleware
    await User.findByIdAndUpdate(
        req.user._id,
        { $unset: { refreshToken: 1 } },
        { new: true }
    );

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    };

    // Clear both cookies
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json({
            success: true,
            message: "User logged out successfully"
        });
});

const getCurrentUser = asynchandler(async (req, res) => {
    return res.status(200).json({ success: true, data: req.user });
});

const updateCurrentUser = asynchandler(async (req, res) => {
    const update = {};
    if (typeof req.body.username === "string" && req.body.username.trim()) {
        update.username = req.body.username.trim();
    }
    if (typeof req.body.phoneNumber === "string") {
        update.phoneNumber = req.body.phoneNumber.trim();
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: update },
        { new: true, runValidators: true }
    ).select("-password -refreshToken");

    return res.status(200).json({ success: true, data: user });
});

export { registerUser, loginUser, logoutUser, getCurrentUser, updateCurrentUser };
