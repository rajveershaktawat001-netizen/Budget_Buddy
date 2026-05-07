# Project Source Code

## backend/.env

```
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/trackexpense
JWT_SECRET=mysecretkey
FRONTEND_URL=http://localhost:5173
STRIPE_SECRET_KEY=

```

## backend/config/db.js

```javascript
import mongoose from "mongoose";

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not set in the environment");
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("DB connected");
  } catch (error) {
    console.error("DB connection failed:", error.message);
    process.exit(1);
  }
};

```

## backend/controllers/dashboardController.js

```javascript
import incomeModel from "../models/incomeModel.js";
import expenseModel from "../models/expenseModel.js";

export async function getDashboardOverview(req, res) {
    const userId = req.user._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    try {
        const incomes = await incomeModel.find({
            userId,
            date: { $gte: startOfMonth, $lte: now },
        }).lean();

        const expenses = await expenseModel.find({
            userId,
            date: { $gte: startOfMonth, $lte: now },
        }).lean();

        const monthlyIncome = incomes.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
        const monthlyExpense = expenses.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
        const savings = monthlyIncome - monthlyExpense;
        const savingsRate = monthlyIncome === 0 ? 0 : Math.round((savings / monthlyIncome) * 100);

        const recentTransactions = [
            ...incomes.map((i) => ({ ...i, type: "income" })),
            ...expenses.map((e) => ({ ...e, type: "expense" })),
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const spendByCategory = {};
        for (const exp of expenses) {
            const cat = exp.category || "Other";
            spendByCategory[cat] = (spendByCategory[cat] || 0) + Number(exp.amount || 0);
        }

        const expenseDistribution = Object.entries(spendByCategory).map(([category, amount]) => ({
            category,
            amount,
            percent: monthlyExpense === 0 ? 0 : Math.round((amount / monthlyExpense) * 100),
        }));//for chart

        return res.status(200).json({
            success: true,
            data: {
                monthlyIncome,
                monthlyExpense,
                savings,
                savingsRate,
                recentTransactions,
                spendByCategory,
                expenseDistribution
            }
        })
    }

    catch (err) {
        console.error("GetDashboardOverview Error:", err);
        return res.status(500).json({
            success: false,
            message: "Dashboard Fetch failed"
        });
    }
}
```

## backend/controllers/expenseController.js

```javascript
import expenseModel from "../models/expenseModel.js";
import getDateRange from "../utils/dateFilter.js";
import XLSX from 'xlsx';

// add expense
export async function addExpense(req, res) {
    const userId = req.user._id
    const { description, amount, category, date } = req.body;

    try {
        if (!description || !amount || !category || !date) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }
        const newExpense = new expenseModel({
            userId,
            description,
            amount,
            category,
            date: new Date(date)
        });

        await newExpense.save()
        res.json({
            success: true,
            message: "Expense added successfully!"
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to all expense
export async function getAllExpense(req, res) {
    const userId = req.user._id;
    try {
        const expense = await expenseModel.find({ userId }).sort({ date: -1 });
        res.json(expense);
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to update the expense
export async function updateExpense(req, res) {
    const { id } = req.params;
    const userId = req.user._id;
    const { description, amount } = req.body;

    try {
        const updatedExpense = await expenseModel.findOneAndUpdate(
            { _id: id, userId },
            { description, amount },
            { new: true }
        );

        if (!updatedExpense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }

        res.json({
            success: true, message: "Expense updated successfully.", data:
                updatedExpense
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// delete an expense
export async function deleteExpense(req, res) {
    try {
        const expense = await expenseModel.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id,
        });
        if (!expense) {
            return res.status(404).json({
                success: false,
                message: "Expense not found"
            });
        }
        return res.json({
            success: true,
            message: "Expense deleted successfully!"
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// download excel for expense
export async function downloadExpenseExcel(req, res) {
    const userId = req.user._id;
    try {
        const expense = await expenseModel.find({ userId }).sort({ date: -1 });
        const plainData = expense.map((exp) => ({
            Description: exp.description,
            Amount: exp.amount,
            Category: exp.category,
            Date: new Date(exp.date).toLocaleDateString(),
        }));

        const worksheet = XLSX.utils.json_to_sheet(plainData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "expenseModel");
        XLSX.writeFile(workbook, "expense_details.xlsx");
        res.download("expense_details.xlsx");
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to get overview of expense
export async function getExpenseOverview(req, res) {
    try {
        const userId = req.user._id;
        const { range = "monthly" } = req.query;
        const { start, end } = getDateRange(range);

        const expense = await expenseModel.find({
            userId,
            date: { $gte: start, $lte: end },
        }).sort({ date: -1 });


        const totalExpense = expense.reduce((acc, cur) => acc + cur.amount, 0);
        const averageExpense =
            expense.length > 0 ? totalExpense / expense.length : 0;
        const numberOfTransactions = expense.length;
        const recentTransactions = expense.slice(0, 5);

        res.json({
            success: true,
            data: {
                totalExpense,
                averageExpense,
                numberOfTransactions,
                recentTransactions,
                range
            }
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

```

## backend/controllers/incomeController.js

```javascript
import incomeModel from "../models/incomeModel.js";
import XLSX from 'xlsx';
import getDateRange from "../utils/dateFilter.js";

// add income
export async function addIncome(req, res) {
    const userId = req.user._id
    const { description, amount, category, date } = req.body;

    try {
        if (!description || !amount || !category || !date) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        const newIncome = new incomeModel({
            userId,
            description,
            amount,
            category,
            date: new Date(date)
        });
        await newIncome.save()
        res.json({
            success: true,
            message: "Income added successfully!"
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to get income(all)
export async function getAllIncome(req, res) {
    const userId = req.user._id;
    try {
        const income = await incomeModel.find({ userId }).sort({ date: -1 });
        res.json(income);
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// update an income
export async function updateIncome(req, res) {
    const { id } = req.params;
    const userId = req.user._id;
    const { description, amount } = req.body;

    try {
        const updatedIncome = await incomeModel.findOneAndUpdate(
            { _id: id, userId },
            { description, amount },
            { new: true }
        );

        if (!updatedIncome) {
            return res.status(404).json({
                success: false,
                message: "Income not found"
            });
        }

        res.json({
            success: true, message: "Income updated successfully.", data:
                updatedIncome
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to delete an income
export async function deleteIncome(req, res) {
    try {
        const income = await incomeModel.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id,
        });
        if (!income) {
            return res.status(404).json({
                success: false,
                message: "Income not found"
            });
        }
        return res.json({
            success: true,
            message: "Income deleted successfully!"
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to download the data in an excel sheet
export async function downloadIncomeExcel(req, res) {
    const userId = req.user._id;
    try {
        const income = await incomeModel.find({ userId }).sort({ date: -1 });
        const plainData = income.map((inc) => ({
            Description: inc.description,
            Amount: inc.amount,
            Category: inc.category,
            Date: new Date(inc.date).toLocaleDateString(),
        }));

        const worksheet = XLSX.utils.json_to_sheet(plainData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "incomeModel");
        XLSX.writeFile(workbook, "income_details.xlsx");
        res.download("income_details.xlsx");
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to get income overview
export async function getIncomeOverview(req, res) {
    try {
        const userId = req.user._id;
        const { range = "monthly" } = req.query;
        const { start, end } = getDateRange(range);

        const incomes = await incomeModel.find({
            userId,
            date: { $gte: start, $lte: end },
        }).sort({ date: -1 });


        const totalIncome = incomes.reduce((acc, cur) => acc + cur.amount, 0);
        const averageIncome = incomes.length > 0 ? totalIncome / incomes.length : 0;
        const numberOfTransactions = incomes.length;
        const recentTransactions = incomes.slice(0, 9);

        res.json({
            success: true,
            data: {
                totalIncome,
                averageIncome,
                numberOfTransactions,
                recentTransactions,
                range
            }
        });
    }

    catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

```

## backend/controllers/paymentController.js

```javascript
import Stripe from "stripe";

const getStripeClient = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set in the environment");
  }

  return new Stripe(secretKey);
};

export async function createCheckoutSession(req, res) {
  const { amount, currency = "usd", description = "Wallet top-up" } = req.body;

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: "A valid amount is required",
    });
  }

  try {
    const stripe = getStripeClient();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const normalizedAmount = Math.round(Number(amount) * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: req.user?.email,
      metadata: {
        userId: String(req.user?._id || ""),
        description,
      },
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: description,
            },
            unit_amount: normalizedAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/?payment=success`,
      cancel_url: `${frontendUrl}/?payment=cancel`,
    });

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("CreateCheckoutSession Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create checkout session",
    });
  }
}

```

## backend/controllers/userController.js

```javascript
import User from '../models/userModel.js';
import validator from 'validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';
const TOKEN_EXPIRES = '24h';

const createToken = (userId) =>
    jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES });

// REGISTER A USER
export async function registerUser(req, res) {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "All fields are required."
        });
    }
    if (!validator.isEmail(email)) {
        return res.status(400).json({
            success: false,
            message: "Invalid email"
        });
    }
    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must be atleast of 8 characters."
        })
    }

    try {
        if (await User.findOne({ email })) {
            return res.status(409).json({
                success: false,
                message: "User already present"
            });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, password: hashed });
        const token = createToken(user._id);
        res.status(201).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email }
        });
    }

    catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to login a user
export async function loginUser(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Both fields are required."
        });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const token = createToken(user._id);
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    }

    catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to get login user details
export async function getCurrentUser(req, res) {
    try {
        const user = await User.findById(req.user.id).select("name email");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        res.json({ success: true, user });
    }

    catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to update a user profile
export async function updateProfile(req, res) {
    const { name, email } = req.body;
    if (!name || !email || !validator.isEmail(email)) {
        return res.status(400).json({
            success: false,
            message: "Valid email and name are required."
        });
    }

    try {
        const exists = await User.findOne({ email, _id: { $ne: req.user.id } });
        if (exists) {
            return res.status(409).json({
                success: false,
                message: "Email already in use."
            });
        }
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { name, email },
            { new: true, runValidators: true, select: "name email" }
        );
        res.json({
            success: true,
            user
        })
    }

    catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

// to change user password
export async function updatePassword(req, res) {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password invalid or too short."
        });
    }
    try {
        const user = await User.findById(req.user.id).select("password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) {
            return res.status(401).json({
                success: false,
                message: "Current Password is incorrect."
            });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({
            success: true,
            message: "Password changed"
        });
    }

    catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

```

## backend/expense_details.xlsx

```xlsx
PK         ����  �     xl/_rels/workbook.xml.rels<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/></Relationships>PK         0�k�  �     xl/theme/theme1.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Cambria"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="ＭＳ Ｐゴシック"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="宋体"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Times New Roman"/><a:font script="Hebr" typeface="Times New Roman"/><a:font script="Thai" typeface="Tahoma"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="MoolBoran"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Times New Roman"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="ＭＳ Ｐゴシック"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="宋体"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Arial"/><a:font script="Hebr" typeface="Arial"/><a:font script="Thai" typeface="Tahoma"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="DaunPenh"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Arial"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="100000"/><a:shade val="100000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/><a:shade val="100000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst><a:scene3d><a:camera prst="orthographicFront"><a:rot lat="0" lon="0" rev="0"/></a:camera><a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="1200000"/></a:lightRig></a:scene3d><a:sp3d><a:bevelT w="63500" h="25400"/></a:sp3d></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults><a:spDef><a:spPr/><a:bodyPr/><a:lstStyle/><a:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="3"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="2"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></a:style></a:spDef><a:lnDef><a:spPr/><a:bodyPr/><a:lstStyle/><a:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></a:style></a:lnDef></a:objectDefaults><a:extraClrSchemeLst/></a:theme>PK         U��Z  Z     xl/styles.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><numFmts count="1"><numFmt numFmtId="56" formatCode="&quot;上午/下午 &quot;hh&quot;時&quot;mm&quot;分&quot;ss&quot;秒 &quot;"/></numFmts><fonts count="1"><font><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/></styleSheet>PK         �hMY       xl/worksheets/sheet1.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:D4"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData><row r="1"><c r="A1" t="str"><v>Description</v></c><c r="B1" t="str"><v>Amount</v></c><c r="C1" t="str"><v>Category</v></c><c r="D1" t="str"><v>Date</v></c></row><row r="2"><c r="A2" t="str"><v>Medicine</v></c><c r="B2"><v>1200</v></c><c r="C2" t="str"><v>Healthcare</v></c><c r="D2" t="str"><v>26/2/2026</v></c></row><row r="3"><c r="A3" t="str"><v>Fast Food</v></c><c r="B3"><v>1500</v></c><c r="C3" t="str"><v>Food</v></c><c r="D3" t="str"><v>9/2/2026</v></c></row><row r="4"><c r="A4" t="str"><v>Snacks</v></c><c r="B4"><v>1700</v></c><c r="C4" t="str"><v>Food</v></c><c r="D4" t="str"><v>9/2/2026</v></c></row></sheetData><ignoredErrors><ignoredError numberStoredAsText="1" sqref="A1:D4"/></ignoredErrors></worksheet>PK         `� ��  �     xl/metadata.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">
  <metadataTypes count="1">
    <metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/>
  </metadataTypes>
  <futureMetadata name="XLDAPR" count="1">
    <bk>
      <extLst>
        <ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}">
          <xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/>
        </ext>
      </extLst>
    </bk>
  </futureMetadata>
  <cellMetadata count="1">
    <bk>
      <rc t="1" v="0"/>
    </bk>
  </cellMetadata>
</metadata>PK         ��p�H  H     xl/workbook.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr codeName="ThisWorkbook"/><sheets><sheet name="expenseModel" sheetId="1" r:id="rId1"/></sheets></workbook>PK         Jj�L  L     _rels/.rels<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>PK         �x��8  8     docProps/app.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SheetJS</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>expenseModel</vt:lpstr></vt:vector></TitlesOfParts></Properties>PK         ֒|Z  Z     docProps/core.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>PK         ��j�       [Content_Types].xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Default Extension="xml" ContentType="application/xml"/><Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/><Default Extension="data" ContentType="application/vnd.openxmlformats-officedocument.model+data"/><Default Extension="bmp" ContentType="image/bmp"/><Default Extension="png" ContentType="image/png"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="wmf" ContentType="image/x-wmf"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="tif" ContentType="image/tiff"/><Default Extension="tiff" ContentType="image/tiff"/><Default Extension="pdf" ContentType="application/pdf"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/></Types>PK           ����  �                   xl/_rels/workbook.xml.relsPK           0�k�  �               �  xl/theme/theme1.xmlPK           U��Z  Z               �   xl/styles.xmlPK           �hMY                 �%  xl/worksheets/sheet1.xmlPK           `� ��  �               �)  xl/metadata.xmlPK           ��p�H  H               m-  xl/workbook.xmlPK           Jj�L  L               �.  _rels/.relsPK           �x��8  8               W1  docProps/app.xmlPK           ֒|Z  Z               �3  docProps/core.xmlPK           ��j�                 F5  [Content_Types].xmlPK    
 
 {  �=    
```

## backend/income_details.xlsx

```xlsx
PK         ����  �     xl/_rels/workbook.xml.rels<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/></Relationships>PK         0�k�  �     xl/theme/theme1.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Cambria"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="ＭＳ Ｐゴシック"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="宋体"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Times New Roman"/><a:font script="Hebr" typeface="Times New Roman"/><a:font script="Thai" typeface="Tahoma"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="MoolBoran"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Times New Roman"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="ＭＳ Ｐゴシック"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="宋体"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Arial"/><a:font script="Hebr" typeface="Arial"/><a:font script="Thai" typeface="Tahoma"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="DaunPenh"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Arial"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="100000"/><a:shade val="100000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/><a:shade val="100000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst><a:scene3d><a:camera prst="orthographicFront"><a:rot lat="0" lon="0" rev="0"/></a:camera><a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="1200000"/></a:lightRig></a:scene3d><a:sp3d><a:bevelT w="63500" h="25400"/></a:sp3d></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults><a:spDef><a:spPr/><a:bodyPr/><a:lstStyle/><a:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="3"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="2"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></a:style></a:spDef><a:lnDef><a:spPr/><a:bodyPr/><a:lstStyle/><a:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></a:style></a:lnDef></a:objectDefaults><a:extraClrSchemeLst/></a:theme>PK         U��Z  Z     xl/styles.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><numFmts count="1"><numFmt numFmtId="56" formatCode="&quot;上午/下午 &quot;hh&quot;時&quot;mm&quot;分&quot;ss&quot;秒 &quot;"/></numFmts><fonts count="1"><font><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium4"/></styleSheet>PK         5���  �     xl/worksheets/sheet1.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:D2"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData><row r="1"><c r="A1" t="str"><v>Description</v></c><c r="B1" t="str"><v>Amount</v></c><c r="C1" t="str"><v>Category</v></c><c r="D1" t="str"><v>Date</v></c></row><row r="2"><c r="A2" t="str"><v>Web Project</v></c><c r="B2"><v>15000</v></c><c r="C2" t="str"><v>Freelancing</v></c><c r="D2" t="str"><v>9/2/2026</v></c></row></sheetData><ignoredErrors><ignoredError numberStoredAsText="1" sqref="A1:D2"/></ignoredErrors></worksheet>PK         `� ��  �     xl/metadata.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xlrd="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">
  <metadataTypes count="1">
    <metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/>
  </metadataTypes>
  <futureMetadata name="XLDAPR" count="1">
    <bk>
      <extLst>
        <ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}">
          <xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/>
        </ext>
      </extLst>
    </bk>
  </futureMetadata>
  <cellMetadata count="1">
    <bk>
      <rc t="1" v="0"/>
    </bk>
  </cellMetadata>
</metadata>PK         �a�PG  G     xl/workbook.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr codeName="ThisWorkbook"/><sheets><sheet name="incomeModel" sheetId="1" r:id="rId1"/></sheets></workbook>PK         Jj�L  L     _rels/.rels<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>PK         ny7  7     docProps/app.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SheetJS</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>incomeModel</vt:lpstr></vt:vector></TitlesOfParts></Properties>PK         ֒|Z  Z     docProps/core.xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>PK         ��j�       [Content_Types].xml<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Default Extension="xml" ContentType="application/xml"/><Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/><Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/><Default Extension="data" ContentType="application/vnd.openxmlformats-officedocument.model+data"/><Default Extension="bmp" ContentType="image/bmp"/><Default Extension="png" ContentType="image/png"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="emf" ContentType="image/x-emf"/><Default Extension="wmf" ContentType="image/x-wmf"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="tif" ContentType="image/tiff"/><Default Extension="tiff" ContentType="image/tiff"/><Default Extension="pdf" ContentType="application/pdf"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/></Types>PK           ����  �                   xl/_rels/workbook.xml.relsPK           0�k�  �               �  xl/theme/theme1.xmlPK           U��Z  Z               �   xl/styles.xmlPK           5���  �               �%  xl/worksheets/sheet1.xmlPK           `� ��  �               �(  xl/metadata.xmlPK           �a�PG  G               H,  xl/workbook.xmlPK           Jj�L  L               �-  _rels/.relsPK           ny7  7               10  docProps/app.xmlPK           ֒|Z  Z               �2  docProps/core.xmlPK           ��j�                 4  [Content_Types].xmlPK    
 
 {  e<    
```

## backend/middleware/auth.js

```javascript
import User from '../models/userModel.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

export default async function authMiddleware(req, res, next) {
    // grab the token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Not authorized or token missing"
        });
    }
    const token = authHeader.split(" ")[1];

    // to verify the token
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(payload.id).select("-password");
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }
        req.user = user;
        next();
    }

    catch (err) {
        console.error("JWT verification failed:", err);
        return res.status(401).json({
            success: false,
            message: "Token invalid or expired"
        });
    }
}

```

## backend/models/expenseModel.js

```javascript
import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true,
    },
    date: {
        type: Date,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
    },
    type: {
        type: String,
        default: "expense",
    },
}, {
    timestamps: true
});

const expenseModel = mongoose.models.expense || mongoose.model("expense", expenseSchema);
export default expenseModel;
```

## backend/models/incomeModel.js

```javascript
import mongoose from "mongoose";

const incomeSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true,
    },
    date: {
        type: Date,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
    }, //for a particular user 
    type: {
        type: String,
        default: "income",
    },
}, {
    timestamps: true
});

const incomeModel = mongoose.models.income || mongoose.model("income", incomeSchema);
export default incomeModel;
```

## backend/models/userModel.js

```javascript
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    }
});

const userModel = mongoose.models.user || mongoose.model("user", userSchema);
export default userModel;
```

## backend/package.json

```json
{
  "name": "backend",
  "version": "1.0.0",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "nodemon server.js"
  },
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "body-parser": "^2.2.2",
    "cors": "^2.8.6",
    "dotenv": "^17.2.4",
    "express": "^5.2.1",
    "jsonwebtoken": "^9.0.3",
    "mongoose": "^9.1.6",
    "nodemon": "^3.1.11",
    "stripe": "^18.5.0",
    "validator": "^13.15.26",
    "xlsx": "^0.18.5"
  }
}

```

## backend/routes/dashboardRoute.js

```javascript
import express from 'express';

import { getDashboardOverview } from '../controllers/dashboardController.js';
import authMiddleware from '../middleware/auth.js';

const dashboardRouter = express.Router();

dashboardRouter.get("/", authMiddleware, getDashboardOverview);

export default dashboardRouter;
```

## backend/routes/expenseRoute.js

```javascript
import express from 'express'
import authMiddleware from '../middleware/auth.js';
import { addExpense, deleteExpense, downloadExpenseExcel, getAllExpense, getExpenseOverview, updateExpense } from '../controllers/expenseController.js';

const expenseRouter = express.Router();

expenseRouter.post("/add", authMiddleware, addExpense);
expenseRouter.get("/get", authMiddleware, getAllExpense);

expenseRouter.put("/update/:id", authMiddleware, updateExpense);
expenseRouter.get("/downloadexcel", authMiddleware, downloadExpenseExcel);

expenseRouter.delete("/delete/:id", authMiddleware, deleteExpense);
expenseRouter.get("/overview", authMiddleware, getExpenseOverview);

export default expenseRouter;
```

## backend/routes/incomeRoute.js

```javascript
import express from 'express'
import authMiddleware from '../middleware/auth.js';
import { addIncome, deleteIncome, downloadIncomeExcel, getAllIncome, getIncomeOverview, updateIncome } from '../controllers/incomeController.js';

const incomeRouter = express.Router();

incomeRouter.post("/add", authMiddleware, addIncome);
incomeRouter.get("/get", authMiddleware, getAllIncome);

incomeRouter.put("/update/:id", authMiddleware, updateIncome);
incomeRouter.get("/downloadexcel", authMiddleware, downloadIncomeExcel);

incomeRouter.delete("/delete/:id", authMiddleware, deleteIncome);
incomeRouter.get("/overview", authMiddleware, getIncomeOverview);

export default incomeRouter;
```

## backend/routes/paymentRoute.js

```javascript
import express from "express";
import authMiddleware from "../middleware/auth.js";
import { createCheckoutSession } from "../controllers/paymentController.js";

const paymentRouter = express.Router();

paymentRouter.post("/checkout", authMiddleware, createCheckoutSession);

export default paymentRouter;

```

## backend/routes/userRoute.js

```javascript
import express from 'express';
import { getCurrentUser, loginUser, registerUser, updatePassword, updateProfile } from '../controllers/userController.js';
import authMiddleware from '../middleware/auth.js';

const userRouter = express.Router();

userRouter.post("/register", registerUser);
userRouter.post("/login", loginUser);

// protected Routes
userRouter.get("/me", authMiddleware, getCurrentUser);
userRouter.put("/profile", authMiddleware, updateProfile);
userRouter.put("/password", authMiddleware, updatePassword);

export default userRouter;
```

## backend/server.js

```javascript
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { connectDB } from './config/db.js';

import userRouter from './routes/userRoute.js';
import incomeRouter from './routes/incomeRoute.js';
import expenseRouter from './routes/expenseRoute.js';
import dashboardRouter from './routes/dashboardRoute.js';
import paymentRouter from './routes/paymentRoute.js';

const app = express();
const port = process.env.PORT || 4000;

// MIDDLEWARES
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DB
connectDB();

// ROUTES
app.use("/api/user", userRouter);
app.use("/api/income", incomeRouter);
app.use("/api/expense", expenseRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/payment", paymentRouter);

app.get('/', (req, res) => {
    res.send("API WORKING");
});

app.listen(port, () => {
    console.log(`Server Started on http://localhost:${port}`);
});

```

## backend/utils/dateFilter.js

```javascript
const getDateRange = (range) => {
    const now = new Date();
    let start;

    switch (range) {
        case "daily":
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case "weekly":
            const firstDayOfWeek = now.getDate() - now.getDay();
            start = new Date(now.setDate(firstDayOfWeek));
            break;
        case "monthly":
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case "yearly":
            start = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            start = new Date(now.getFullYear(), now.getMonth(), 1); // default monthly
    }

    return { start, end: new Date() };
};

export default getDateRange
```

## frontend/.env

```
VITE_API_URL=http://localhost:4000

```

## frontend/.gitignore

```
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

```

## frontend/eslint.config.js

```javascript
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])

```

## frontend/index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Lobster&display=swap"
      rel="stylesheet"
    />
    <title>Budget Buddy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>

```

## frontend/package.json

```json
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.1.18",
    "axios": "^1.13.5",
    "framer-motion": "^12.34.2",
    "lucide-react": "^0.574.0",
    "qr-scanner": "^1.4.2",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-modal": "^3.16.3",
    "react-router-dom": "^7.13.0",
    "react-toastify": "^11.0.5",
    "recharts": "^3.7.0",
    "tailwindcss": "^4.1.18",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "vite": "^7.3.1"
  }
}

```

## frontend/README.md

```md
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

```

## frontend/src/App.jsx

```javascript
import React, { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./components/Login";
import Signup from "./components/Signup";
import axios from "axios";
import Income from "./pages/Income";
import Expense from "./pages/Expense";
import Profile from "./pages/Profile";
import Payment from "./pages/Payment";
import { API_URL } from "./config/api";

// to get transaction from localstorage
const getTransactionsFromStorage = () => {
  const saved = localStorage.getItem("transactions");
  return saved ? JSON.parse(saved) : [];
};

// to protect the routes
const ProtectedRoute = ({ user, children }) => {
  const localToken = localStorage.getItem("token");
  const sessionToken = sessionStorage.getItem("token");
  const hasToken = localToken || sessionToken;

  if (!user || !hasToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// to scroll to top when page gets reload or new page is visited
const ScrollToTop = () => {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return null;
};

const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // to save the token
  const persistAuth = (userObj, tokenStr, remember = false) => {
    try {
      if (remember) {
        if (userObj) localStorage.setItem("user", JSON.stringify(userObj));
        if (tokenStr) localStorage.setItem("token", tokenStr);
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("token");
      } else {
        if (userObj) sessionStorage.setItem("user", JSON.stringify(userObj));
        if (tokenStr) sessionStorage.setItem("token", tokenStr);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      }
      setUser(userObj || null);
      setToken(tokenStr || null);
    } catch (err) {
      console.error("persistAuth error:", err);
    }
  };

  const clearAuth = () => {
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("token");
    } catch (err) {
      console.error("clearAuth error:", err);
    }
    setUser(null);
    setToken(null);
  };

  // to update user data both in state and storage
  const updateUserData = (updatedUser) => {
    setUser(updatedUser);

    const localToken = localStorage.getItem("token");
    const sessionToken = sessionStorage.getItem("token");

    if (localToken) {
      localStorage.setItem("user", JSON.stringify(updatedUser));
    } else if (sessionToken) {
      sessionStorage.setItem("user", JSON.stringify(updatedUser));
    }
  };

  // try to load user with token when mounted
  useEffect(() => {
    (async () => {
      try {
        const localUserRaw = localStorage.getItem("user");
        const sessionUserRaw = sessionStorage.getItem("user");
        const localToken = localStorage.getItem("token");
        const sessionToken = sessionStorage.getItem("token");

        const storedUser = localUserRaw
          ? JSON.parse(localUserRaw)
          : sessionUserRaw
            ? JSON.parse(sessionUserRaw)
            : null;

        const storedToken = localToken || sessionToken || null;
        const tokenFromLocal = !!localToken;

        if (storedUser) {
          setUser(storedUser);
          setToken(storedToken);
          setIsLoading(false);
          return;
        }

        if (storedToken) {
          try {
            const res = await axios.get(`${API_URL}/api/user/me`, {
              headers: { Authorization: `Bearer ${storedToken}` },
            });
            const profile = res.data;
            persistAuth(profile, storedToken, tokenFromLocal);
          } catch (fetchErr) {
            console.warn(
              "Could not fetch profile with the stored token:",
              fetchErr,
            );
            clearAuth();
          }
        }
      } catch (err) {
        console.error("error bootstrapping auth:", err);
      } finally {
        setIsLoading(false);

        try {
          setTransactions(getTransactionsFromStorage());
        } catch (txErr) {
          console.error("Error loading transactions:", txErr);
        }
      }
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("transactions", JSON.stringify(transactions));
    } catch (err) {
      console.error("error saving transactions:", err);
    }
  }, [transactions]);

  const handleLogin = (userData, remember = false, tokenFromApi = null) => {
    persistAuth(userData, tokenFromApi, remember);
    navigate("/");
  };

  const handleSignup = (userData, remember = false, tokenFromApi = null) => {
    persistAuth(userData, tokenFromApi, remember);
    navigate("/");
  };

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  // transaction helpers
  const addTransaction = (newTransaction) =>
    setTransactions((p) => [newTransaction, ...p]);
  const editTransaction = (id, updatedTransaction) =>
    setTransactions((p) =>
      p.map((t) => (t.id === id ? { ...updatedTransaction, id } : t)),
    );
  const deleteTransaction = (id) =>
    setTransactions((p) => p.filter((t) => t.id !== id));
  const refreshTransactions = () =>
    setTransactions(getTransactionsFromStorage());

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollToTop />

      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/signup" element={<Signup onSignup={handleSignup} />} />

        <Route
          element={
            <ProtectedRoute user={user}>
              <Layout
                user={user}
                onLogout={handleLogout}
                transactions={transactions}
                addTransaction={addTransaction}
                editTransaction={editTransaction}
                deleteTransaction={deleteTransaction}
                refreshTransactions={refreshTransactions}
              />
            </ProtectedRoute>
          }
        >
          <Route
            path="/"
            element={<Dashboard />}
            transactions={transactions}
            addTransaction={addTransaction}
            editTransaction={editTransaction}
            deleteTransaction={deleteTransaction}
            refreshTransactions={refreshTransactions}
          />

          <Route
            path="/income"
            element={
              <Income
                transactions={transactions}
                addTransaction={addTransaction}
                editTransaction={editTransaction}
                deleteTransaction={deleteTransaction}
                refreshTransactions={refreshTransactions}
              />
            }
          />

          <Route
            path="/expense"
            element={
              <Expense
                transactions={transactions}
                addTransaction={addTransaction}
                editTransaction={editTransaction}
                deleteTransaction={deleteTransaction}
                refreshTransactions={refreshTransactions}
              />
            }
          />

          <Route
            path="/payment"
            element={<Payment addTransaction={addTransaction} />}
          />

          <Route
            path="/profile"
            element={
              <Profile
                user={user}
                onUpdateProfile={updateUserData}
                onLogout={handleLogout}
              />
            }
          />
        </Route>

        <Route
          path="*"
          element={<Navigate to={user ? "/" : "/login"} replace />}
        />
      </Routes>
    </>
  );
};

export default App;

```

## frontend/src/assets/color.jsx

```javascript
// constants/financeConstants.js
// constants/financeConstants.js
import { 
  Utensils, Home, Car, ShoppingCart, Gift, 
  TrendingUp, TrendingDown, DollarSign, 
  BarChart2, ArrowUp, FileText, 
  Briefcase, CreditCard, ShoppingBag, 
  Film, Wifi, Heart
} from "lucide-react";


export const GAUGE_COLORS = {
  Income: { 
    gradientStart: '#0d9488',
    gradientEnd: '#0f766e',
    text: 'text-teal-600',
    bg: 'bg-teal-100'
  },
  Spent: { 
    gradientStart: '#f97316',
    gradientEnd: '#ea580c',
    text: 'text-orange-600',
    bg: 'bg-orange-100'
  },
  Savings: { 
    gradientStart: '#0891b2',
    gradientEnd: '#0e7490',
    text: 'text-cyan-600',
    bg: 'bg-cyan-100'
  }
};

export const COLORS = ['#0d9488', '#0f766e', '#0891b2', '#0e7490', '#f97316', '#ea580c', '#14b8a6'];

export const INCOME_COLORS = [
  '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'
];

export const CATEGORY_ICONS_Inc = {
  Salary: <TrendingUp className="w-4 h-4" />,
  Freelance: <BarChart2 className="w-4 h-4" />,
  Investment: <ArrowUp className="w-4 h-4" />,
  Bonus: <FileText className="w-4 h-4" />,
  Other: <DollarSign className="w-4 h-4" />
};

export const CATEGORY_ICONS = {
  Food: <Utensils className="w-4 h-4" />,
  Housing: <Home className="w-4 h-4" />,
  Transport: <Car className="w-4 h-4" />,
  Shopping: <ShoppingCart className="w-4 h-4" />,
  Entertainment: <Gift className="w-4 h-4" />,
  Utilities: <Home className="w-4 h-4" />,
  Healthcare: <Gift className="w-4 h-4" />,
  Salary: <TrendingUp className="w-4 h-4" />,
  Freelance: <TrendingDown className="w-4 h-4" />,
  Other: <DollarSign className="w-4 h-4" />
};

// Enhanced category icons with more specific icons for income categories
export const INCOME_CATEGORY_ICONS = {
  Salary: <Briefcase className="w-5 h-5 text-green-500" />,
  Freelance: <CreditCard className="w-5 h-5 text-green-500" />,
  Investment: <TrendingUp className="w-5 h-5 text-green-500" />,
  Gift: <Gift className="w-5 h-5 text-green-500" />,
  Other: <DollarSign className="w-5 h-5 text-green-500" />,
};

export const EXPENSE_CATEGORY_ICONS = {
  Food: <Utensils className="w-5 h-5 text-orange-500" />,
  Housing: <Home className="w-5 h-5 text-orange-500" />,
  Transport: <Car className="w-5 h-5 text-orange-500" />,
  Shopping: <ShoppingBag className="w-5 h-5 text-orange-500" />,
  Entertainment: <Film className="w-5 h-5 text-orange-500" />,
  Utilities: <Wifi className="w-5 h-5 text-orange-500" />,
  Healthcare: <Heart className="w-5 h-5 text-orange-500" />,
  Other: <ShoppingCart className="w-5 h-5 text-orange-500" />,
};

export const colorClasses = {
    income: {
      bg: "bg-teal-100",
      text: "text-teal-600",
      border: "border-teal-200",
      ring: "ring-teal-500",
      button: "bg-teal-500 hover:bg-teal-600 text-white",
      iconBg: "bg-teal-100 text-teal-600",
    },
    expense: {
      bg: "bg-orange-100",
      text: "text-orange-600",
      border: "border-orange-200",
      ring: "ring-orange-500",
      button: "bg-orange-500 hover:bg-orange-600 text-white",
      iconBg: "bg-orange-100 text-orange-600",
    },
  };
```

## frontend/src/assets/dummy.js

```javascript
 // src/data/dummyData.js
import { v4 as uuidv4 } from 'uuid';

// Generate random dates within the last 30 days
const randomDate = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];
};
// Gauge Data (current + history)
export const gaugeData = [
  {
    name: 'Income',
    value: 4500,
    history: [3200, 4000, 5000, 6000, 5500],
  },
  {
    name: 'Expenses',
    value: 3200,
    history: [1800, 1900, 2100, 2400, 3000],
  },
  {
    name: 'Savings',
    value: 1800,
    history: [1000, 1200, 900, 1500, 1800],
  },
];

// Categories for expenses
const categories = ['Food', 'Housing', 'Transport', 'Shopping', 'Entertainment', 'Utilities', 'Healthcare'];

// Generate dummy transactions
export const dummyTransactions = Array.from({ length: 100 }, (_, i) => {
  const isExpense = Math.random() > 0.3; // 70% chance of being an expense
  const amount = (Math.random() * 500 + 10).toFixed(2);
  const category = categories[Math.floor(Math.random() * categories.length)];
  
  return {
    id: uuidv4(),
    type: isExpense ? 'expense' : 'income',
    amount,
    description: `${isExpense ? 'Payment for' : 'Income from'} ${category.toLowerCase()}`,
    category,
    date: randomDate(),
    receipt: null
  };
});

// Generate stats data
export const statsData = {
  monthSpent: 2450.75,
  monthRemaining: 1549.25,
  topCategory: 'Food',
  topCategoryAmount: 780.50,
  budget: 4000
};

// Generate financial overview data
export const financialOverviewData = [
  { name: 'Food', value: 780.50 },
  { name: 'Housing', value: 1200.00 },
  { name: 'Transport', value: 350.25 },
  { name: 'Shopping', value: 420.75 },
  { name: 'Entertainment', value: 230.50 },
  { name: 'Utilities', value: 180.00 },
  { name: 'Healthcare', value: 150.00 }
];

// Colors for charts
export const COLORS = ['#4f46e5', '#10b981', '#f97316', '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b'];


```

## frontend/src/assets/dummyStyles.js

```javascript
// assets/dummyStyles.js

export const dashboardStyles = {
  // Layout styles
  container: "min-h-screen p-4 md:p-6",
  
  // Header styles
  headerContainer: "bg-gradient-to-r from-teal-500/10 to-cyan-500/10 backdrop-blur-lg rounded-3xl p-6 mb-8 shadow-lg border border-white/30",
  headerContent: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8",
  headerTitle: "text-3xl md:text-4xl font-bold bg-gradient-to-r from-teal-600 to-cyan-700 bg-clip-text text-transparent",
  headerSubtitle: "text-gray-600 mt-2",
  
  // Button styles
  addButton: "flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-5 py-3 rounded-xl transition-all shadow hover:shadow-md font-medium",
  
  // Time frame selector styles
  timeFrameContainer: "flex justify-end mt-4",
  timeFrameWrapper: "flex gap-0 bg-white p-1 -mx-5 rounded-xl border border-gray-200",
  timeFrameButton: (isActive) => 
    `px-2.5 py-2 text-sm rounded-lg transition-all ${
      isActive 
        ? "bg-teal-500 text-white" 
        : "text-gray-600 hover:bg-gray-100"
    }`,
  
  // Summary cards grid
  summaryGrid: "grid grid-cols-1 lg:-mx-3 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-8",
  
  // Financial card styles
  balanceBadge: "bg-teal-100 text-teal-800 px-2 py-1 rounded-lg text-xs",
  expenseBadge: "bg-orange-100 text-orange-800 px-1 py-1 rounded-lg text-xs",
  
  // Gauge container styles
  gaugeGrid: "grid grid-cols-1 -mx-5 xl:-mx-5 md:grid-cols-3 md:gap-13 lg:gap-3 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8",
  
  // Pie chart container styles
  pieChartContainer: "hidden md:block bg-white lg:-mx-5.5 md:-mx-4 lg:p-1 xl:-mx-3 rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden mb-8",
  pieChartHeader: "flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3",
  pieChartTitle: "text-xl lg:pt-3 xl:pl-3 font-bold text-gray-800 mb-5 flex items-center gap-3",
  pieChartSubtitle: "text-sm lg:text-center xl:text-start xl:pl-3 text-gray-500 mb-3",
  pieChartHeight: "h-90 xl:h-80",
  
  // Pie chart tooltip styles
  tooltipContent: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    padding: "12px",
  },
  tooltipItem: { fontWeight: 400 },
  
  // Legend styles
  legendWrapper: { paddingTop: 8 },
  legendText: "text-sm font-medium text-gray-600",
  
  // Income/Expense lists grid
  listsGrid: "grid grid-cols-1 gap-6",
  
  // List container styles
  listContainer: "bg-white rounded-2xl lg:p-5 md:p-6 -mx-8 md:-mx-3 shadow-sm border border-gray-100",
  listHeader: "flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3",
  listTitle: "text-xl font-bold text-gray-800 md:mt-3 mt-3 flex items-center gap-3",
  listSubtitle: "text-sm text-gray-500 font-normal",
  
  // Record count badges
  incomeCountBadge: "text-sm bg-green-100 px-2 mx-2 text-green-800 md:mx-2 md:mt-2 py-1 rounded-full",
  expenseCountBadge: "text-sm bg-orange-100 text-orange-800 px-2 mx-2 md:mx-2 md:mt-2 py-1 rounded-full",
  
  // Transaction item styles
  transactionList: "space-y-3",
  incomeTransactionItem: "flex items-center px-2 mx-2 my-2 md:p-4 md:mx-2 lg:px-3 justify-between p-3 bg-green-50 rounded-lg",
  expenseTransactionItem: "flex items-center justify-between mx-1 p-3 lg:p-3 md:p-4 md:mx-2 bg-orange-50 rounded-lg",
  
  // Transaction icon container
  incomeIconContainer: "p-2 bg-green-100 rounded-lg",
  expenseIconContainer: "p-2 bg-orange-100 rounded-lg",
  
  // Transaction content
  transactionContent: "flex items-center lg:gap-3 md:gap-3 gap-1",
  transactionDescription: "font-medium text-gray-800",
  transactionCategory: "text-sm text-gray-500",
  transactionAmount: "text-right",
  incomeAmount: "font-bold text-green-600",
  expenseAmount: "font-bold text-orange-600",
  transactionDate: "text-sm text-gray-500",
  
  // Empty state styles
  emptyState: "text-center py-8",
  emptyIconContainer: (color) => `w-16 h-16 mx-auto mb-4 rounded-full ${color} flex items-center justify-center`,
  emptyText: "text-gray-600 font-medium",
  
  // View all button styles
  viewAllContainer: "pt-4 border-t border-gray-100",
  viewAllButton: "w-full flex items-center justify-center gap-2 py-3 text-teal-600 font-medium hover:bg-teal-50 rounded-xl transition-colors",
  
  // Icon container styles
  iconContainer: (color) => `p-2 ${color} rounded-lg`,
  
  // Specific icon colors
  walletIconContainer: "p-2 bg-teal-100 rounded-lg",
  arrowDownIconContainer: "p-2 bg-orange-100 rounded-lg",
  piggyBankIconContainer: "p-2 bg-cyan-100 rounded-lg",
};

// Additional styles for financial trends
export const trendStyles = {
  positive: "text-orange-600",
  negative: "text-green-600",
  positiveRate: "bg-teal-100 text-teal-700",
  negativeRate: "bg-red-100 text-red-700",
};

// Chart specific styles
export const chartStyles = {
  pieChart: "lg:-px-5 lg:text-xs xl:text-xl",
};

// Add to existing dummyStyles.js
export const incomeStyles = {
  // Layout
  wrapper: "space-y-4 md:space-y-6 p-3 md:p-4 max-w-7xl mx-auto",
  headerContainer: "bg-white rounded-lg md:rounded-xl p-4 -mx-7 lg:-mx-7 overflow-x-hidden md:p-6 mb-6 md:mb-8 shadow",
  header: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4 mb-4 md:mb-6",
  headerTitle: "text-xl md:text-2xl lg:text-3xl font-bold text-gray-800",
  headerSubtitle: "text-gray-600 mt-1 text-sm md:text-base",
  addButton: "flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-2 md:px-4 md:py-3 rounded-lg md:rounded-xl transition-all shadow-md hover:shadow-lg font-medium text-sm md:text-base",
  
  // Summary Cards
  summaryGrid: "grid grid-cols-1 -mx-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5",
  
  // Chart
  chartContainer: "hidden md:block -mx-7 bg-white rounded-xl p-6 shadow-sm border border-gray-100",
  chartTitle: "text-lg md:text-xl font-bold text-gray-800 mb-4 md:mb-5 flex items-center gap-2 md:gap-3",
  
  // Transaction List
  listContainer: "bg-white rounded-xl -mx-7 md:rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 relative overflow-hidden",
  sectionTitle: "text-lg md:text-xl font-bold text-gray-800 mb-4 md:mb-5 flex items-center gap-2 md:gap-3",
  
  // Filter Section
  filterContainer: "flex flex-col sm:flex-row gap-2 md:gap-3 w-full sm:w-auto",
  filterSelect: "appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent w-full",
  exportButton: "flex items-center justify-center gap-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg transition-all text-sm hover:shadow-md w-full sm:w-auto",
  
  // Transaction Items
  transactionList: "space-y-3 -mx-3 lg:-mx-0 md:-mx-0",
  viewAllButton: "mt-4 w-full text-center py-3 text-green-600 font-medium hover:bg-green-50 rounded-xl transition-colors flex items-center justify-center gap-2",
  
  // Empty State
  emptyStateContainer: "text-center py-6 md:py-8",
  emptyStateIcon: "w-12 h-12 md:w-16 md:h-16 mx-auto mb-3 md:mb-4 rounded-full bg-green-50 flex items-center justify-center",
  emptyStateText: "text-gray-600 font-medium text-sm md:text-base",
  emptyStateSubtext: "text-xs md:text-sm text-gray-500 mt-1 md:mt-2",
  emptyStateButton: "mt-3 md:mt-4 flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-3 py-2 md:px-4 md:py-2.5 rounded-lg md:rounded-xl transition-all shadow-md hover:shadow-lg mx-auto text-sm md:text-base",
  
  // Time Frame Selector Container
  timeFrameContainer: "flex px-10 -mx-14 justify-center lg:-mx-0 md:-mx-0 lg:justify-end md:justify-end mt-4",

   // Chart header container 
  chartHeaderContainer: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5",
  
  // Chart height 
  chartHeight: "h-64 md:h-80",
  
  // Chart tooltip styles 
  tooltipContent: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    padding: "12px",
    backdropFilter: "blur(4px)",
  },
  
  // Icon container styles for summary cards 
  iconGreen: "p-2 bg-green-100 rounded-lg",
  iconBlue: "p-2 bg-blue-100 rounded-lg",
  iconPurple: "p-2 bg-purple-100 rounded-lg",
  
  // Icon text colors 
  textGreen: "text-green-600",
  textBlue: "text-blue-600",
  textPurple: "text-purple-600",
  
  // Filter icon positioning 
  filterIcon: "absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-gray-500 pointer-events-none",
  
  // FinancialCard border colors (if needed, similar to expense page)
  borderGreen: "border-l-4 border-green-500",
  borderBlue: "border-l-4 border-blue-500",
  borderPurple: "border-l-4 border-purple-500",
};

export const expensePageStyles = {
  // Main container
  container: "space-y-6 max-w-7xl",
  
  // Header card
  headerCard: "bg-white rounded-xl p-4  lg:-mx-0 -mx-3.5  overflow-x-hidden mb-8 shadow",
  headerContainer: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4 mb-4 md:mb-6",
  headerTitle: "text-2xl md:text-3xl font-bold text-gray-800",
  headerSubtitle: "text-gray-600 mt-1",
  addButton: "flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-4 py-3 rounded-xl transition-all shadow-md hover:shadow-lg font-medium",
  
  // Financial cards grid
  cardsGrid: "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-5",
  
  // Chart container
  chartContainer: "hidden md:block bg-white rounded-xl p-4 -mx-7 lg:-mx-0 shadow-sm border border-gray-100",
  chartHeader: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5",
  chartTitle: "text-xl font-bold text-gray-800 mb-5 flex items-center gap-3",
  exportButton: "flex items-center gap-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition-all text-sm hover:shadow-md",
  chart: "h-80",
  
  // Transactions container
  transactionsContainer: "bg-white rounded-2xl p-5 -mx-4 lg:-mx-0 md:-mx-5 shadow-sm border border-gray-100 relative overflow-hidden",
  transactionsHeader: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 md:gap-4 mb-4 md:mb-5",
  transactionsTitle: "text-lg md:text-xl font-bold text-gray-800 mb-4 md:mb-5 flex items-center gap-2 md:gap-3",
  filterSelect: "appearance-none bg-white border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent w-full",
  
  // Transaction items
  transactionsList: "space-y-3 -mx-2 lg:-mx-0 md:-mx-0",
  viewAllButton: "mt-4 w-full text-center py-3 text-orange-600 font-medium hover:bg-amber-50 rounded-xl transition-colors flex items-center justify-center gap-2",
  emptyState: "text-center py-8",
  emptyStateIcon: "w-16 h-16 mx-auto mb-4 rounded-full bg-orange-50 flex items-center justify-center",
  emptyStateText: "text-gray-600 font-medium",
  emptyStateSubtext: "text-sm text-gray-500 mt-2",
  
  // Icons
  iconOrange: "p-2 bg-orange-100 rounded-lg",
  iconAmber: "p-2 bg-amber-100 rounded-lg",
  iconYellow: "p-2 bg-yellow-100 rounded-lg",
  textOrange: "text-orange-600",
  textAmber: "text-amber-600",
  textYellow: "text-yellow-600",
  
  // Borders
  borderOrange: "border-l-4 border-orange-500",
  borderAmber: "border-l-4 border-amber-500",
  borderYellow: "border-l-4 border-yellow-500",
  // Chart tooltip styles 
  tooltipContent: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    padding: "12px",
    backdropFilter: "blur(4px)",
  },
  
  // Chart height style 
  chartHeight: "h-80",
  
  // Export button for chart header (different from existing exportButton)
  chartExportButton: "flex items-center gap-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition-all text-sm hover:shadow-md",
  
  // Additional empty state style 
  emptyStateSubtext: "text-sm text-gray-500 mt-2",
  
  // Timeframe positioning 
  timeframePositioning: "flex px-10 -mx-14 justify-center lg:-mx-0 md:-mx-0 lg:justify-end md:justify-end mt-4",
  
  // Transaction item specific styles 
  transactionItemContainer: "flex items-center justify-between p-3 -mx-2 hover:bg-amber-50 rounded-xl transition-all duration-300 border border-gray-100 cursor-pointer mb-3 group",
  transactionAmount: "font-bold",
  transactionIcon: "lg:p-3 md:p-3 p-1 rounded-lg",

  
};

export const profileStyles = {
  // Container styles
  container: "max-w-4xl mx-auto py-8 px-4",
  mainContainer: "bg-white -mx-7 rounded-2xl shadow-sm overflow-hidden",
  
  // Header styles
  header: "bg-gradient-to-r from-teal-500 to-emerald-600 p-8 text-center",
  avatar: "w-24 h-24 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-4",
  userName: "text-2xl font-bold text-white",
  userEmail: "text-teal-100 mt-2",
  
  // Content styles
  content: "p-8 -mx-6.5",
  grid: "grid grid-cols-1 md:grid-cols-2 gap-8",
  
  // Card styles
  card: "bg-gray-50 rounded-xl p-6",
  cardTitle: "text-xl font-semibold pb-3 text-gray-800 flex items-center",
  icon: "w-5 h-5 mr-2 text-teal-600",
  
  // Form styles
  label: "text-sm text-gray-500  block mb-1",
  input: "w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-300 focus:border-teal-500",
  inputWithError: "w-full px-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-teal-300 focus:border-teal-500",
  
  // Button styles
  buttonPrimary: "flex-1 bg-gradient-to-r from-teal-500 to-emerald-600 text-white py-2.5 rounded-xl font-medium shadow-md",
  buttonSecondary: "flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-100",
  editButton: "text-teal-600 hover:text-teal-700 font-medium text-sm",
  changeButton: "text-teal-600 hover:text-teal-700 font-medium lg:text-sm",
  
  // Security item
  securityItem: "flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200",
  securityText: "font-medium lg:text-sm text-gray-400",
  
  // Modal styles
  modalContent: "bg-white rounded-2xl p-6 lg:px-28 w-full max-w-md",
  modalHeader: "flex justify-between lg:whitespace-nowrap lg:space-x-20 mb-6",
  modalTitle: "text-xl font-bold lg:pl-10 text-gray-800",
  
  // Password input
  passwordLabel: "block text-sm font-medium text-gray-700 mb-1",
  passwordContainer: "relative",
  passwordToggle: "absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600",
  
  // Error text
  errorText: "mt-1 text-sm text-red-600"
};

// Add to existing dummyStyles.js
export const modalStyles = {
  // Modal container
  overlay: "fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50",
  modalContainer: "bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl",
  
  // Header
  modalHeader: "flex justify-between items-center mb-4",
  modalTitle: "text-xl font-bold text-gray-800",
  closeButton: "text-gray-500 hover:text-gray-800",
  
  // Form elements
  form: "space-y-4",
  label: "block text-sm font-medium text-gray-700 mb-1",
  input: (ringColor) => `w-full border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 ${ringColor}`,
  
  // Type buttons
  typeButtonContainer: "flex gap-4",
  typeButton: (isSelected, color) => 
    `flex-1 py-2 rounded-lg font-medium ${
      isSelected 
        ? `${color} text-white shadow-md` 
        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
    }`,
  
  // Submit button
  submitButton: (color) => `w-full text-white py-3 rounded-lg font-medium mt-4 shadow-md hover:shadow-lg transition-all ${color}`,
  
  // Color classes
  colorClasses: {
    teal: {
      button: "bg-teal-500 hover:bg-teal-600",
      ring: "focus:ring-teal-500",
      typeButtonSelected: "bg-teal-500",
    },
    orange: {
      button: "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600",
      ring: "focus:ring-orange-500",
      typeButtonSelected: "bg-orange-500",
    },
  },
};



// In src/assets/dummyStyles.js - add these styles
export const loginStyles = {
  // Page container
  pageContainer: "min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-teal-50 to-emerald-50",
  
  // Card container
  cardContainer: "w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden",
  
  // Header styles
  header: "bg-gradient-to-r from-teal-500 to-emerald-600 p-6 text-center",
  avatar: "w-20 h-20 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-4",
  headerTitle: "text-2xl font-bold text-white",
  headerSubtitle: "text-teal-100 mt-2",
  
  // Form container
  formContainer: "p-8",
  
  // Error message
  errorContainer: "mb-6 p-3 bg-red-50 text-red-700 rounded-lg flex items-center",
  errorIcon: "w-6 h-6 rounded-full bg-red-100 flex items-center justify-center mr-3",
  errorText: "break-words",
  
  // Form elements
  label: "block text-sm font-medium text-gray-700 mb-2",
  inputContainer: "relative",
  inputIcon: "absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400",
  input: "w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-300 focus:border-teal-500",
  passwordInput: "w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-300 focus:border-teal-500",
  passwordToggle: "absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600",
  
  // Checkbox
  checkboxContainer: "mb-6 flex items-center",
  checkbox: "w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500",
  checkboxLabel: "ml-2 block text-sm text-gray-700",
  
  // Button
  button: "w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white py-3 rounded-xl font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center",
  buttonDisabled: "opacity-80 cursor-not-allowed",
  
  // Sign up link
  signUpContainer: "mt-8 text-center",
  signUpText: "text-gray-600",
  signUpLink: "font-medium text-teal-600 hover:underline",
  
  // Spinner for loading state
  spinner: "animate-spin -ml-1 mr-3 h-5 w-5 text-white"
};

// Styles for Navbar component
export const navbarStyles = {
  // Layout and container styles
  header: "sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm",
  container: "flex items-center justify-between px-4 py-3 md:px-8 max-w-7xl mx-auto",
  
  // Logo styles
  logoContainer: "flex items-center gap-0 cursor-pointer",
  logoImage: "w-15 h-15 rounded-xl overflow-hidden",
  
  // Text styles
  logoText: "lg:text-3xl md:text-3xl text-2xl text-gray-900 font-[550] lobster-regular",
  
  // User profile styles
  userContainer: "relative",
  userButton: "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors",
  userAvatar: "w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-500 text-white font-bold text-lg",
  statusIndicator: "absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white",
  userTextContainer: "text-left hidden md:block",
  userName: "text-sm font-medium text-gray-800 truncate max-w-[120px]",
  userEmail: "text-xs text-gray-500 truncate max-w-[120px]",
  chevronIcon: (isOpen) => `w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`,
  
  // Dropdown menu styles
  dropdownMenu: "absolute top-14 right-0 w-56 bg-white rounded-xl shadow-lg border border-gray-100 z-50",
  dropdownHeader: "px-4 py-3 border-b border-gray-100",
  dropdownAvatar: "w-10 h-10 rounded-full bg-gradient-to-br from-teal-600 to-cyan-500 flex items-center justify-center text-white font-bold text-lg",
  dropdownName: "text-sm text-gray-800 ",
  dropdownEmail: "text-xs text-gray-500",
  
  // Menu items
  menuItemContainer: "p-1.5",
  menuItem: "w-full px-4 py-3 text-left hover:bg-gray-50 text-sm text-gray-700 flex items-center gap-3 rounded-lg",
  menuItemBorder: "p-1.5 border-t border-gray-100",
  logoutButton: "flex w-full items-center gap-3 px-4 py-3 text-sm hover:bg-red-50 text-red-600 rounded-lg"
};


// In src/assets/dummyStyles.js - add these styles
export const signupStyles = {
  // Page container (reusing from login)
  pageContainer: "min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-teal-50 to-emerald-50",
  
  // Card container (reusing from login)
  cardContainer: "w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden",
  
  // Header styles (reusing from login with additions)
  header: "bg-gradient-to-r from-teal-500 to-emerald-600 p-6 text-center relative",
  avatar: "w-20 h-20 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-4",
  headerTitle: "text-2xl font-bold text-white",
  headerSubtitle: "text-teal-100 mt-2",
  backButton: "absolute top-4 left-4 p-2 text-white rounded-full hover:bg-white/10 transition-colors",
  
  // Form container (reusing from login)
  formContainer: "p-8",
  
  // Error messages
  apiError: "mb-4 text-center text-sm text-red-600",
  fieldError: "mt-1 text-sm text-red-600",
  
  // Form elements (reusing from login with additions)
  label: "block text-sm font-medium text-gray-700 mb-2",
  inputContainer: "relative",
  inputIcon: "absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400",
  input: "w-full pl-10 pr-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-teal-300 focus:border-teal-500",
  passwordInput: "w-full pl-10 pr-10 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-teal-300 focus:border-teal-500",
  passwordToggle: "absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600",
  
  // Checkbox (reusing from login)
  checkboxContainer: "mb-6 flex items-center",
  checkbox: "w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500",
  checkboxLabel: "ml-2 block text-sm text-gray-700",
  
  // Button (reusing from login)
  button: "w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white py-3 rounded-xl font-medium shadow-md hover:shadow-lg transition-all flex items-center justify-center",
  buttonDisabled: "opacity-80 cursor-not-allowed",
  
  // Sign in link (reusing from login with modifications)
  signInContainer: "mt-8 text-center",
  signInText: "text-gray-600",
  signInLink: "font-medium text-teal-600 hover:underline",
  
  // Spinner for loading state (reusing from login)
  spinner: "animate-spin -ml-1 mr-3 h-5 w-5 text-white"
};

export const transactionItemStyles = {
  // Container styles
  container: (isEditing, classes) => 
    `flex flex-col md:flex-row items-stretch justify-between gap-3 p-4 rounded-xl border border-gray-100 mb-3 last:mb-0 ${isEditing ? classes.bg : "hover:bg-gray-50"}`,
  
  // Layout styles
  mainContainer: "flex items-center gap-3 flex-1 min-w-0",
  actionsContainer: "flex items-center justify-between gap-3 mt-2 md:mt-0",
  amountContainer: "min-w-[100px] flex-shrink-0 flex justify-end",
  buttonsContainer: "flex gap-1 flex-shrink-0",
  
  // Icon styles
  iconContainer: (iconClass, classes) => `${iconClass} ${classes.iconBg}`,
  
  // Content styles
  contentContainer: "min-w-0 flex-1",
  description: "font-medium text-gray-800 truncate",
  details: "text-xs text-gray-500 mt-1 truncate",
  
  // Input styles
  input: (hasError, classes) => 
    `w-full bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 ${hasError ? "border-red-500 ring-red-500" : `${classes.border} ${classes.ring}`}`,
  amountInput: (hasError, classes) => 
    `w-full max-w-[120px] bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 ${hasError ? "border-red-500 ring-red-500" : `${classes.border} ${classes.ring}`}`,
  
  // Error styles
  errorText: "text-xs text-red-600 mt-1",
  
  // Amount display
  amountText: (amountClass, classes) => `${amountClass} ${classes.text}`,
  
  // Button styles
  saveButton: (classes) => `p-2 ${classes.button} rounded-lg`,
  cancelButton: "p-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400",
  editButton: (classes) => `p-2 ${classes.text} rounded-lg hover:${classes.bg}`,
  deleteButton: (classes) => `p-2 ${classes.text} rounded-lg hover:${classes.bg}`
};

// Centralized styles for the application
export const sidebarStyles = {
  // Layout and container styles
  sidebarContainer: {
    base: "hidden lg:flex flex-col pt-3 fixed top-16 bottom-0 z-30"
  },
  
  sidebarInner: {
    base: "bg-white border-r  border-gray-200 shadow-md h-full flex flex-col"
  },
  
  // User profile section
  userProfileContainer: {
    base: "p-4 border-b pt-20 md:pt-5 lg:pt-5 xl:pt-5 border-gray-100",
    collapsed: "px-3",
    expanded: "px-6"
  },
  
  userInitials: {
    base: "w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white font-bold text-xl"
  },
  
  // Menu items
  menuList: {
    base: "space-y-1 px-2"
  },
  
  menuItem: {
    base: "relative flex items-center gap-3 py-3 rounded-xl font-medium transition-all duration-200",
    active: "text-teal-600 bg-teal-50",
    inactive: "text-gray-600 hover:text-teal-700 hover:bg-gray-50",
    collapsed: "justify-center px-0 mx-2",
    expanded: "px-4"
  },
  
  menuIcon: {
    active: "text-teal-600",
    inactive: "text-gray-500"
  },
  
  activeIndicator: "absolute right-4 w-2 h-2 bg-teal-400 rounded-full animate-ping",
  
  // Toggle button
  toggleButton: {
    base: "absolute -right-3 top-12 z-20 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center text-gray-500 hover:text-teal-600 hover:border-teal-400 hover:bg-teal-50 transition-all"
  },
  
  // Footer section
  footerContainer: {
    base: "border-t border-gray-100 p-4",
    collapsed: "px-3",
    expanded: "px-6"
  },
  
  footerLink: {
    base: "flex items-center gap-3 py-2 rounded-xl font-medium text-gray-600 hover:text-teal-700 hover:bg-gray-50",
    collapsed: "justify-center"
  },
  
  logoutButton: {
    base: "flex items-center gap-3 py-2 rounded-xl font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 w-full mt-1",
    collapsed: "justify-center"
  },
  
  // Mobile sidebar
  mobileOverlay: "fixed inset-0 z-40 lg:hidden",
  mobileBackdrop: "absolute inset-0 bg-black/30 backdrop-blur-sm",
  
  mobileSidebar: {
    base: "absolute left-0 top-0 bottom-0 w-4/5 max-w-sm bg-white shadow-2xl rounded-r-2xl overflow-hidden"
  },
  
  mobileHeader: "p-6 flex justify-between items-center border-b border-gray-100",
  mobileUserContainer: "flex pt-28 items-center gap-3",
  mobileCloseButton: "p-2 rounded-lg hover:bg-gray-100",
  
  mobileMenuList: "space-y-1",
  mobileMenuItem: {
    base: "flex items-center gap-4 px-6 py-4 font-medium",
    active: "text-teal-600 bg-teal-50",
    inactive: "text-gray-600 hover:bg-gray-50"
  },
  
  mobileFooter: "border-t border-gray-100 p-6",
  mobileFooterLink: "flex items-center gap-4 py-2 font-medium text-gray-600 hover:text-teal-700",
  mobileLogoutButton: "flex items-center gap-4 py-2 font-medium text-gray-600 hover:text-red-600 w-full",
  
  // Mobile menu button
  mobileMenuButton: "lg:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-cyan-500 to-teal-600 text-white rounded-full flex items-center justify-center shadow-xl"
};

// Helper function to combine class names
export const cn = (...classes) => classes.filter(Boolean).join(" ");

// assets/dummyStyles.js

export const styles = {
  // Layout and Container Styles
  layout: {
    root: "min-h-screen bg-gradient-to-br from-gray-50 to-gray-100",
    mainContainer: (sidebarCollapsed) => 
      `p-4 pt-6 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`,
  },

  // Header Styles
  header: {
    container: "flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4",
    title: "text-2xl font-bold text-gray-800",
    subtitle: "text-gray-600",
  },

  // Stat Card Styles
  statCards: {
    grid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-6",
    card: "bg-white p-5 rounded-2xl shadow-sm border border-gray-100",
    cardHeader: "flex justify-between items-start",
    cardTitle: "text-sm text-gray-600",
    cardValue: "text-2xl font-bold text-gray-800 mt-1",
    iconContainer: (color) => `bg-${color}-100 p-2 rounded-lg`,
    icon: (color) => `w-5 h-5 text-${color}-600`,
    cardFooter: "text-xs text-gray-500 mt-3",
  },

  // Grid Layout
  grid: {
    main: "grid grid-cols-1 lg:grid-cols-3 gap-6",
    leftColumn: "lg:col-span-2 space-y-6",
    rightColumn: "lg:col-span-1 lg:-mx-3 space-y-6",
  },

  // Card Styles
  cards: {
    base: "bg-white rounded-2xl p-6 shadow-sm border border-gray-100",
    header: "flex justify-between items-center mb-6",
    title: "text-xl font-bold text-gray-800 flex items-center gap-3",
    titleIcon: "w-6 h-6",
  },

  // Recent Transactions Card
  transactions: {
    cardHeader: "flex justify-between items-center mb-4",
    cardTitle: "text-md md:text-xl lg:text-xl xl:text-xl font-bold text-gray-800 flex items-center gap-3",
    refreshButton: "p-2 rounded-lg hover:bg-gray-100 transition-colors",
    refreshIcon: (loading) => `w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`,
    dataStackingInfo: "flex items-center gap-2 text-xs text-gray-500 mb-4 bg-blue-50 p-2 rounded-lg",
    dataStackingIcon: "w-4 h-4 text-blue-500",
    listContainer: "space-y-4 max-h-[500px] -mx-5 overflow-y-auto pr-2",
    transactionItem: "flex items-center lg:flex-col xl:flex-row md:flex-row justify-between p-1 -mx-0 lg:p-4 md:p-4 hover:bg-gray-50 rounded-xl transition-all duration-300 border border-gray-100",
    iconWrapper: (type) => type === 'income' ? 'bg-teal-100 text-teal-600' : 'bg-orange-100 text-orange-600',
    icon: "w-4 h-4",
    details: "min-w-0",
    description: "font-medium text-gray-800 truncate max-w-[120px]",
    meta: "text-xs text-gray-500 mt-1",
    amount: (type) => `font-semibold ${type === 'income' ? 'text-teal-600' : 'text-orange-600'}`,
    emptyState: "text-center py-8",
    emptyIconContainer: "w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center",
    emptyIcon: "w-8 h-8 text-purple-500",
    emptyText: "text-gray-600 font-medium",
    viewAllContainer: "pt-4 border-t border-gray-100",
    viewAllButton: "w-full flex items-center justify-center gap-2 py-3 text-teal-600 font-medium hover:bg-teal-50 rounded-xl transition-colors",
  },

  // Spending by Category Card
  categories: {
    title: "text-lg md:text-xl lg:text-xl xl:text-xl font-bold text-gray-800 mb-6 flex items-center gap-3",
    titleIcon: "w-6 h-6 text-cyan-500",
    list: "space-y-4",
    categoryItem: "flex items-center md:text-lg lg:text-sm xl:text-lg justify-between",
    categoryIconContainer: "bg-gray-100 p-2 rounded-lg",
    categoryIcon: "w-4 h-4 text-gray-600",
    categoryName: "font-medium text-gray-700",
    categoryAmount: "font-semibold text-gray-800",
    summaryContainer: "mt-6 pt-6 border-t border-gray-100",
    summaryGrid: "grid grid-cols-2 gap-4",
    summaryIncomeCard: "bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-4",
    summaryExpenseCard: "bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4",
    summaryTitle: "text-sm text-gray-600",
    summaryValue: "text-sm font-bold text-gray-800",
  },

  // Color Helpers
  colors: {
    transaction: {
      text: (type) => type === 'income' ? 'text-teal-600' : 'text-orange-600',
      bg: (type) => type === 'income' ? 'bg-teal-100 text-teal-600' : 'bg-orange-100 text-orange-600',
    },
    expenseChange: (change) => change > 0 ? 'text-orange-600' : 'text-green-600',
  },
};
```

## frontend/src/components/Add.jsx

```javascript
import React, { useEffect, useRef, useState } from "react";
import { modalStyles } from "../assets/dummyStyles";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import QrScanner from "qr-scanner";
import qrScannerWorkerSource from "qr-scanner/qr-scanner-worker.min.js?url";
QrScanner.WORKER_PATH = qrScannerWorkerSource;

const parseQrData = (rawValue, fallbackCategory) => {
  const nextState = {};

  try {
    if (rawValue.startsWith("upi://")) {
      const url = new URL(rawValue);
      const payeeName = url.searchParams.get("pn");
      const payeeAddress = url.searchParams.get("pa");
      const amount = url.searchParams.get("am");
      const note = url.searchParams.get("tn");
      const merchantCode = url.searchParams.get("mc");

      nextState.description =
        payeeName || note || payeeAddress || "QR payment";
      nextState.amount = amount || "";
      nextState.category =
        merchantCode === "5411" ? "Food" : fallbackCategory || "Other";
      nextState.type = "expense";
      return nextState;
    }

    if (rawValue.startsWith("{")) {
      const parsed = JSON.parse(rawValue);
      nextState.description =
        parsed.description || parsed.name || parsed.payee || "QR payment";
      nextState.amount = parsed.amount || "";
      nextState.category = parsed.category || fallbackCategory || "Other";
      if (parsed.type) nextState.type = parsed.type;
      return nextState;
    }
  } catch {
    // Fall through to plain-text parsing.
  }

  nextState.description = rawValue.slice(0, 80);
  return nextState;
};

const AddTransactionModal = ({
  showModal,
  setShowModal,
  newTransaction,
  setNewTransaction,
  handleAddTransaction,
  type = "both",
  title = "Add New Transaction",
  buttonText = "Add Transaction",
  categories = [
    "Food",
    "Housing",
    "Transport",
    "Shopping",
    "Entertainment",
    "Utilities",
    "Healthcare",
    "Salary",
    "Freelance",
    "Investments",
    "Bonus",
    "Other",
  ],
  color = "teal",
  onPaymentInitiate = null,
}) => {
  const [scanMessage, setScanMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [showPaymentOption, setShowPaymentOption] = useState(false);
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const qrScannerRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanFrameRef = useRef(null);
  const scanTimeoutRef = useRef(null);

  // Get current date in YYYY-MM-DD format
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentDate = today.toISOString().split("T")[0];
  const minDate = `${currentYear}-01-01`;

  const colorClass = modalStyles.colorClasses[color];

  const stopCamera = () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (scanFrameRef.current) {
      cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    }

    if (qrScannerRef.current) {
      qrScannerRef.current.destroy();
      qrScannerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setIsScanning(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleImageScan = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setScanMessage("Scanning image...");
    setIsScanning(true);

    try {
      const result = await QrScanner.scanImage(file);
      const parsed = parseQrData(result, newTransaction.category);
      setNewTransaction((prev) => ({
        ...prev,
        ...parsed,
      }));
      setScanMessage("QR scanned from image. Transaction fields were updated.");
      
      // Show payment option if amount is detected and payment handler exists
      if (parsed.amount && onPaymentInitiate) {
        setShowPaymentOption(true);
        setScanMessage("QR scanned! You can pay now or save as transaction.");
      }
    } catch (error) {
      console.error("Image scan failed:", error);
      setScanMessage("Could not scan QR code from image. Try taking a clearer photo.");
    } finally {
      setIsScanning(false);
      // Reset the input
      if (event.target) event.target.value = '';
    }
  };

  const openCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handlePaymentInitiate = () => {
    if (onPaymentInitiate && newTransaction.amount) {
      onPaymentInitiate(parseFloat(newTransaction.amount));
      setShowModal(false);
      setShowPaymentOption(false);
      setNewTransaction({
        description: "",
        amount: "",
        category: categories[0],
        type: type === "both" ? "expense" : type,
        date: currentDate,
      });
    }
  };

  const startCameraScan = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setScanMessage("Camera access is not available in this browser.");
      return;
    }

    if (!(await QrScanner.hasCamera())) {
      setScanMessage("No camera found.");
      return;
    }

    setScanMessage("");
    setIsScanning(true);
    setCameraActive(true);

    // Redirect to payment details after 5 seconds
    scanTimeoutRef.current = setTimeout(() => {
      stopCamera();
      setShowModal(false);
      navigate("/payment");
    }, 5000);

    // Delay to ensure video element is visible
    setTimeout(() => {
      try {
        const handleSuccess = (result) => {
          console.log("QR Code detected:", result);
          const qrValue = typeof result === 'string' ? result : (result.data || result);
          const parsed = parseQrData(qrValue, newTransaction.category);
          setNewTransaction((prev) => ({
            ...prev,
            ...parsed,
          }));
          setScanMessage("✅ QR scanned. Transaction fields were updated.");
          
          // Show payment option if amount is detected and payment handler exists
          if (parsed.amount && onPaymentInitiate) {
            setShowPaymentOption(true);
            setScanMessage("✅ QR scanned! You can pay now or save as transaction.");
          }
          
          stopCamera();
        };

        qrScannerRef.current = new QrScanner(
          videoRef.current,
          handleSuccess,
          {
            onDecodeError: (error) => {
              console.log("Scanning...");
            },
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
          }
        );

        qrScannerRef.current.start()
          .then(() => {
            console.log("QR Scanner started successfully");
            setScanMessage("📸 Scanning... Point your camera at a QR code");
          })
          .catch((error) => {
            console.error("Camera start failed:", error);
            setScanMessage(`❌ Camera error: ${error.message || 'Could not access camera'}`);
            stopCamera();
          });
      } catch (error) {
        console.error("QR Scanner setup failed:", error);
        setScanMessage(`❌ Setup failed: ${error.message}`);
        stopCamera();
      }
    }, 300);
  };

  useEffect(() => {
    if (!showModal) {
      stopCamera();
      setScanMessage("");
      setShowPaymentOption(false);
    }
  }, [showModal]);

  useEffect(() => {
    if (!cameraActive) {
      setIsScanning(false);
    }
  }, [cameraActive]);

  if (!showModal) return null;

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.modalContainer}>
        <div className={modalStyles.modalHeader}>
          <h3 className={modalStyles.modalTitle}>{title}</h3>
          <button
            onClick={() => setShowModal(false)}
            className={modalStyles.closeButton}
          >
            <X size={24} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddTransaction();
          }}
        >
          <div className={modalStyles.form}>
            <div>
              <label className={modalStyles.label}>Scan QR</label>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={cameraActive ? stopCamera : startCameraScan}
                  className={modalStyles.submitButton(colorClass.button)}
                >
                  {cameraActive ? "Stop Camera" : "Start Live Scanner"}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageScan}
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
                {!cameraActive && (
                  <button
                    type="button"
                    onClick={openCameraCapture}
                    className={modalStyles.submitButton(colorClass.button)}
                  >
                    📸 Scan from Camera App
                  </button>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    display: cameraActive ? 'block' : 'none',
                    width: '100%',
                    height: '14rem',
                    objectFit: 'cover',
                  }}
                  className="rounded-lg border border-gray-200"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Scan a QR code live to auto-fill amount and description, or wait 5 seconds to proceed to payment manually.
              </p>
              {scanMessage && (
                <p className="mt-2 text-xs text-teal-600">{scanMessage}</p>
              )}
            </div>

            <div>
              <label className={modalStyles.label}>Description</label>
              <input
                type="text"
                value={newTransaction.description}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
                placeholder={
                  type === "both"
                    ? "Salary, Funds, etc."
                    : "Groceries, Rent, etc."
                }
                required
              />
            </div>

            <div>
              <label className={modalStyles.label}>Amount</label>
              <input
                type="number"
                value={newTransaction.amount}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    amount: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
                placeholder="0.00"
                required
              />
            </div>

            {type === "both" && (
              <div>
                <label className={modalStyles.label}>Type</label>
                <div className={modalStyles.typeButtonContainer}>
                  <button
                    type="button"
                    className={modalStyles.typeButton(
                      newTransaction.type === "income",
                      modalStyles.colorClasses.teal.typeButtonSelected,
                    )}
                    onClick={() =>
                      setNewTransaction((prev) => ({ ...prev, type: "income" }))
                    }
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    className={modalStyles.typeButton(
                      newTransaction.type === "expense",
                      modalStyles.colorClasses.orange.typeButtonSelected,
                    )}
                    onClick={() =>
                      setNewTransaction((prev) => ({
                        ...prev,
                        type: "expense",
                      }))
                    }
                  >
                    Expense
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className={modalStyles.label}>Category</label>
              <select
                value={newTransaction.category}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    category: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
              >
                {categories.map((cat) => (
                  <option value={cat} key={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={modalStyles.label}>Date</label>
              <input
                type="date"
                value={newTransaction.date}
                onChange={(e) =>
                  setNewTransaction((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
                className={modalStyles.input(colorClass.ring)}
                min={minDate}
                max={currentDate}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isScanning}
              className={modalStyles.submitButton(colorClass.button)}
            >
              {isScanning ? "Scanning..." : buttonText}
            </button>

            {showPaymentOption && newTransaction.amount && onPaymentInitiate && (
              <div className="mt-3 flex gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={handlePaymentInitiate}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  💳 Pay ${parseFloat(newTransaction.amount).toFixed(2)}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaymentOption(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Save Only
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTransactionModal;

```

## frontend/src/components/FinancialCard.jsx

```javascript
import React from "react";

const FinancialCard = ({
  icon,
  label,
  value,
  additionalContent,
  borderColor = "",
  bgColor = "bg-white",
}) => (
  <div
    className={`${bgColor} rounded-xl p-5 lg:-mx-2 lg:p-2 shadow-sm
     border hover:shadow-md border-gray-100 transition-all ${borderColor}`}
  >
    <div className="text-sm font-medium text-gray-600 flex items-center gap-2">
      {icon}
      {label}
    </div>
    <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    {additionalContent}
  </div>
);

export default FinancialCard;

```

## frontend/src/components/GaugeCard.jsx

```javascript
import React from "react";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

const GaugeCard = ({
  gauge = {},
  colorInfo = {},
  timeFrameLabel = "",
  highlightNegative = false,
}) => {
  const { name = "Metric", value = 0, max = 100 } = gauge;
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  // For negative values, we'll show the absolute value in the chart but indicate it's negative in text
  const chartValue = isNegative ? absValue : value;
  const percentage = Math.min((absValue / max) * 100, 100);

  // Determine colors based on whether value is negative
  const gradientStart = isNegative
    ? "#ef4444"
    : colorInfo.gradientStart || "#00C49F";
  const gradientEnd = isNegative
    ? "#dc2626"
    : colorInfo.gradientEnd || "#0088FE";
  const textColor = isNegative
    ? "text-red-600"
    : colorInfo.text || "text-gray-800";
  const percentColor = isNegative ? "text-red-500" : "text-gray-500";

  return (
    <div className="bg-white rounded-xl p-5 -mx-3 lg:-mx-0 md:-mx-5 shadow-sm 
    flex flex-col items-center border border-gray-100">
      <h3 className={`text-lg font-semibold mb-4 ${textColor}`}>{name}</h3>
      <div className="w-full h-48">
        <ResponsiveContainer>
          <RadialBarChart
            data={[{ ...gauge, value: chartValue }]}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="100%"
          >
            <PolarAngleAxis
              type="number"
              domain={[0, max]}
              angleAxisId={0}
              tick={false}
              allowDataOverflow
            />

            <RadialBar
              minAngle={15}
              background={{ fill: "#f3f4f6" }}
              dataKey="value"
              cornerRadius="50%"
              fill={`url(#${name}Gradient)`}
            />

            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className={`text-2xl font-bold ${textColor}`}
            >
              {isNegative ? "-" : ""}₹{Math.round(absValue).toLocaleString()}
            </text>
            <text
              x="50%"
              y="65%"
              textAnchor="middle"
              dominantBaseline="middle"
              className={`text-sm ${percentColor}`}
            >
              {Math.round(percentage)}%
            </text>

            <defs>
              <linearGradient
                id={`${name}Gradient`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={gradientStart} />
                <stop offset="100%" stopColor={gradientEnd} />
              </linearGradient>
            </defs>
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center mt-3">
        {isNegative && highlightNegative && (
          <p className="text-sm text-red-600 font-semibold mb-1">
            Negative savings
          </p>
        )}
        <p className="text-sm text-gray-500">{timeFrameLabel} data</p>
      </div>
    </div>
  );
};

export default GaugeCard;

// for Gauge UI like speedometer

```

## frontend/src/components/Helpers.jsx

```javascript
export const getTimeFrameRange = (timeFrame) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (timeFrame === "daily") {
    return { start, end: new Date(now), label: "Today" };
  }

  if (timeFrame === "weekly") {
    const startOfWeek = new Date(start);
    startOfWeek.setDate(start.getDate() - start.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return { start: startOfWeek, end: new Date(now), label: "This Week" };
  }

  if (timeFrame === "monthly") {
    const startOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    return { start: startOfMonth, end: new Date(now), label: "This Month" };
  }

  // yearly
  if (timeFrame === "yearly") {
    const startOfYear = new Date(start.getFullYear(), 0, 1);
    startOfYear.setHours(0, 0, 0, 0);
    return { start: startOfYear, end: new Date(now), label: "This Year" };
  }

  // default -> monthly
  const startOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  return { start: startOfMonth, end: new Date(now), label: "This Month" };
}; //to filter according to day, month, year

export const getPreviousTimeFrameRange = (timeFrame) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (timeFrame === "daily") {
    const yesterday = new Date(start);
    yesterday.setDate(start.getDate() - 1);
    const end = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate(),
      23,
      59,
      59,
      999,
    );
    return {
      start: yesterday,
      end,
      label: "Yesterday",
    };
  }

  if (timeFrame === "weekly") {
    const startOfLastWeek = new Date(start);
    startOfLastWeek.setDate(start.getDate() - start.getDay() - 7);
    startOfLastWeek.setHours(0, 0, 0, 0);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
    endOfLastWeek.setHours(23, 59, 59, 999);
    return { start: startOfLastWeek, end: endOfLastWeek, label: "Last Week" };
  }

  if (timeFrame === "monthly") {
    const startOfLastMonth = new Date(
      start.getFullYear(),
      start.getMonth() - 1,
      1,
    );
    startOfLastMonth.setHours(0, 0, 0, 0);
    const endOfLastMonth = new Date(start.getFullYear(), start.getMonth(), 0);
    endOfLastMonth.setHours(23, 59, 59, 999);
    return {
      start: startOfLastMonth,
      end: endOfLastMonth,
      label: "Last Month",
    };
  }

  if (timeFrame === "yearly") {
    const startOfLastYear = new Date(start.getFullYear() - 1, 0, 1);
    startOfLastYear.setHours(0, 0, 0, 0);
    const endOfLastYear = new Date(
      start.getFullYear() - 1,
      11,
      31,
      23,
      59,
      59,
      999,
    );
    return { start: startOfLastYear, end: endOfLastYear, label: "Last Year" };
  }

  // default -> last month
  const startOfLastMonth = new Date(
    start.getFullYear(),
    start.getMonth() - 1,
    1,
  );
  startOfLastMonth.setHours(0, 0, 0, 0);
  const endOfLastMonth = new Date(start.getFullYear(), start.getMonth(), 0);
  endOfLastMonth.setHours(23, 59, 59, 999);
  return { start: startOfLastMonth, end: endOfLastMonth, label: "Last Month" };
};

export const calculateData = (transactions) => {
  const totals = transactions.reduce(
    (data, t) => {
      const amt = Number(t.amount) || 0;
      if (t.type === "income") {
        data.income += amt;
      } else {
        data.expenses += amt;
      }
      return data;
    },
    { income: 0, expenses: 0 },
  );

  return { ...totals, savings: totals.income - totals.expenses };
};

export const generateChartPoints = (timeFrame) => {
  const now = new Date();
  const points = [];

  if (timeFrame === "daily") {
    // Generate 24 hours for daily view
    for (let i = 0; i < 24; i++) {
      const hour = new Date(now);
      hour.setHours(i, 0, 0, 0);
      points.push({
        date: hour,
        label: hour.toLocaleTimeString([], { hour: "2-digit" }),
        hour: i,
        isCurrent: i === now.getHours(),
      });
    }
  } else if (timeFrame === "weekly") {
    // Generate 7 days for weekly view (Sunday -> Saturday)
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      points.push({
        date: day,
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        isCurrent:
          day.getDate() === now.getDate() && day.getMonth() === now.getMonth(),
      });
    }
  } else if (timeFrame === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), i);
      points.push({
        date: day,
        label: day.toLocaleDateString("en-US", { day: "numeric" }),
        isCurrent: i === now.getDate(),
      });
    }
  } else if (timeFrame === "yearly") {
    for (let i = 0; i < 12; i++) {
      const month = new Date(now.getFullYear(), i, 1);
      points.push({
        date: month,
        label: month.toLocaleDateString("en-US", { month: "short" }),
        isCurrent: i === now.getMonth(),
      });
    }
  } else {
    // fallback -> monthly
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), i);
      points.push({
        date: day,
        label: day.toLocaleDateString("en-US", { day: "numeric" }),
        isCurrent: i === now.getDate(),
      });
    }
  }

  return points;
};
//helper functions to help in filtering

```

## frontend/src/components/Layout.jsx

```javascript
import React, { Activity, useEffect, useMemo, useState } from "react";
import { styles } from "../assets/dummyStyles";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import {
  ArrowDown,
  ArrowUp,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
  Gift,
  Home,
  Info,
  PieChart,
  PiggyBank,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Utensils,
  Zap,
} from "lucide-react";
import axios from "axios";
import { Outlet } from "react-router-dom";
import { API_BASE } from "../config/api";

const CATEGORY_ICONS = {
  Food: <Utensils className="w-4 h-4" />,
  Housing: <Home className="w-4 h-4" />,
  Transport: <Car className="w-4 h-4" />,
  Shopping: <ShoppingCart className="w-4 h-4" />,
  Entertainment: <Gift className="w-4 h-4" />,
  Utilities: <Zap className="w-4 h-4" />,
  Healthcare: <Activity className="w-4 h-4" />,
  Salary: <ArrowUp className="w-4 h-4" />,
  Freelance: <CreditCard className="w-4 h-4" />,
  Savings: <PiggyBank className="w-4 h-4" />,
};

// to filter
const filterTransactions = (transactions, frame) => {
  const now = new Date();
  const today = new Date(now).setHours(0, 0, 0, 0);

  switch (frame) {
    case "daily":
      return transactions.filter((t) => new Date(t.date) >= today);
    case "weekly": {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      return transactions.filter((t) => new Date(t.date) >= startOfWeek);
    }
    case "monthly":
      return transactions.filter(
        (t) => new Date(t.date).getMonth() === now.getMonth(),
      );
    default:
      return transactions;
  }
};

const safeArrayFromResponse = (res) => {
  const body = res?.data;
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.incomes)) return body.incomes;
  if (Array.isArray(body.expenses)) return body.expenses;
  return [];
};

const Layout = ({ onLogout, user }) => {
  const [transactions, setTransactions] = useState([]);
  const [timeFrame, setTimeFrame] = useState("monthly");
  const [loading, setLoading] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // to fetch the transaction from the server side
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [incomeRes, expenseRes] = await Promise.all([
        axios.get(`${API_BASE}/income/get`, { headers }),
        axios.get(`${API_BASE}/expense/get`, { headers }),
      ]);

      const incomes = safeArrayFromResponse(incomeRes).map((i) => ({
        ...i,
        type: "income",
      }));
      const expenses = safeArrayFromResponse(expenseRes).map((e) => ({
        ...e,
        type: "expense",
      }));

      const allTransactions = [...incomes, ...expenses]
        .map((t) => ({
          id: t._id || t.id || t.id_str || Math.random().toString(36).slice(2),
          description: t.description || t.title || t.note || "",
          amount: t.amount != null ? Number(t.amount) : Number(t.value) || 0,
          date: t.date || t.createdAt || new Date().toISOString(),
          category: t.category || t.type || "Other",
          type: t.type,
          raw: t,
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      setTransactions(allTransactions);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(
        "Failed to fetch transactions",
        err?.response || err.message || err,
      );
    } finally {
      setLoading(false);
    }
  };

  //to add transaction either income or expense
  const addTransaction = async (transaction) => {
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const endpoint =
        transaction.type === "income" ? "income/add" : "expense/add";
      await axios.post(`${API_BASE}/${endpoint}`, transaction, { headers });
      await fetchTransactions();
      return true;
    } catch (err) {
      console.error(
        "Failed to add transaction",
        err?.response || err.message || err,
      );
      throw err;
    }
  };

  //to update any transaction
  const editTransaction = async (id, transaction) => {
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const endpoint =
        transaction.type === "income" ? "income/update" : "expense/update";
      await axios.put(`${API_BASE}/${endpoint}/${id}`, transaction, {
        headers,
      });
      await fetchTransactions();
      return true;
    } catch (err) {
      console.error(
        "Failed to edit transaction",
        err?.response || err.message || err,
      );
      throw err;
    }
  };

  //to delete a transaction
  const deleteTransaction = async (id, type) => {
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const endpoint = type === "income" ? "income/delete" : "expense/delete";
      await axios.delete(`${API_BASE}/${endpoint}/${id}`, { headers });
      await fetchTransactions();
      return true;
    } catch (err) {
      console.error(
        "Failed to delete transaction",
        err?.response || err.message || err,
      );
      throw err;
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, timeFrame),
    [transactions, timeFrame],
  ); //filter with timeframe

  //get stats data according to time
  const stats = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const last30DaysTransactions = transactions.filter(
      (t) => new Date(t.date) >= thirtyDaysAgo,
    );

    const last30DaysIncome = last30DaysTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const last30DaysExpenses = last30DaysTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const allTimeIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const allTimeExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const savingsRate =
      last30DaysIncome > 0
        ? Math.round(
            ((last30DaysIncome - last30DaysExpenses) / last30DaysIncome) * 100,
          )
        : 0;

    const last60DaysAgo = new Date(now);
    last60DaysAgo.setDate(now.getDate() - 60);

    const previous30DaysTransactions = transactions.filter((t) => {
      const date = new Date(t.date);
      return date >= last60DaysAgo && date < thirtyDaysAgo;
    });

    const previous30DaysExpenses = previous30DaysTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenseChange =
      previous30DaysExpenses > 0
        ? Math.round(
            ((last30DaysExpenses - previous30DaysExpenses) /
              previous30DaysExpenses) *
              100,
          )
        : 0;

    return {
      totalTransactions: transactions.length,
      last30DaysIncome,
      last30DaysExpenses,
      last30DaysSavings: last30DaysIncome - last30DaysExpenses,
      allTimeIncome,
      allTimeExpenses,
      allTimeSavings: allTimeIncome - allTimeExpenses,
      last30DaysCount: last30DaysTransactions.length,
      savingsRate,
      expenseChange,
    };
  }, [transactions]);

  const timeFrameLabel = useMemo(
    () =>
      timeFrame === "daily"
        ? "Today"
        : timeFrame === "weekly"
          ? "This Week"
          : "This Month",
    [timeFrame],
  );

  const outletContext = {
    transactions: filteredTransactions,
    addTransaction,
    editTransaction,
    deleteTransaction,
    refreshTransactions: fetchTransactions,
    timeFrame,
    setTimeFrame,
    lastUpdated,
  };

  const getSavingsRating = (rate) =>
    rate > 30 ? "Excellent" : rate > 20 ? "Good" : "Needs improvement";

  //for filter using category
  const topCategories = useMemo(
    () =>
      Object.entries(
        transactions
          .filter((t) => t.type === "expense")
          .reduce((acc, t) => {
            acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
            return acc;
          }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    [transactions],
  );

  const displayedTransactions = showAllTransactions
    ? transactions
    : transactions.slice(0, 4);

  return (
    <div className={styles.layout.root}>
      <Navbar user={user} onLogout={onLogout} />
      <Sidebar
        user={user}
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
      />
      <div className={styles.layout.mainContainer(sidebarCollapsed)}>
        <div className={styles.header.container}>
          <div>
            <h1 className={styles.header.title}>Dashboard</h1>
            <p className={styles.header.subtitle}>Welcome Back</p>
          </div>
        </div>

        <div className={styles.statCards.grid}>
          <div className={styles.statCards.card}>
            <div className={styles.statCards.cardHeader}>
              <div>
                <p className={styles.statCards.cardTitle}>Total Balance</p>
                <p className={styles.statCards.cardValue}>
                  ₹
                  {stats.allTimeSavings.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className={styles.statCards.iconContainer("teal")}>
                <DollarSign className={styles.statCards.icon("teal")} />
              </div>
            </div>
            <p className={styles.statCards.cardFooter}>
              <span className=" text-teal-600 font-medium">
                +₹{stats.last30DaysSavings.toLocaleString()}
              </span>{" "}
              this month
            </p>
          </div>

          {/* for income */}
          <div className={styles.statCards.card}>
            <div className={styles.statCards.cardHeader}>
              <div>
                <p className={styles.statCards.cardTitle}>Monthly Income</p>
                <p className={styles.statCards.cardValue}>
                  ₹
                  {stats.last30DaysIncome.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className={styles.statCards.iconContainer("green")}>
                <ArrowUp className={styles.statCards.icon("green")} />
              </div>
            </div>
            <p className={styles.statCards.cardFooter}>
              <span className=" text-green-600 font-medium">+12.5%</span> from
              last month
            </p>
          </div>

          <div className={styles.statCards.card}>
            <div className={styles.statCards.cardHeader}>
              <div>
                <p className={styles.statCards.cardTitle}>Monthly Expense</p>
                <p className={styles.statCards.cardValue}>
                  ₹
                  {stats.last30DaysExpenses.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className={styles.statCards.iconContainer("orange")}>
                <ArrowDown className={styles.statCards.icon("orange")} />
              </div>
            </div>
            <p className={styles.statCards.cardFooter}>
              <span
                className={`${styles.colors.expenseChange(
                  stats.expenseChange,
                )} font-medium`}
              >
                {stats.expenseChange > 0 ? "+" : ""}
                {stats.expenseChange}%
              </span>{" "}
              from last month
            </p>
          </div>

          <div className={styles.statCards.card}>
            <div className={styles.statCards.cardHeader}>
              <div>
                <p className={styles.statCards.cardTitle}>Saving Rate</p>
                <p className={styles.statCards.cardValue}>
                  {stats.savingsRate}%
                </p>
              </div>
              <div className={styles.statCards.iconContainer("blue")}>
                <PiggyBank className={styles.statCards.icon("blue")} />
              </div>
            </div>
            <p className={styles.statCards.cardFooter}>
              {getSavingsRating(stats.savingsRate)}
            </p>
          </div>
        </div>

        <div className={styles.grid.main}>
          <div className={styles.grid.leftColumn}>
            <div className={styles.cards.base}>
              <div className={styles.cards.header}>
                <h3 className={styles.cards.title}>
                  <TrendingUp className=" w-6 h-6 text-teal-500" />
                  Financial Overview
                  <span className=" text-sm text-gray-500 font-normal">
                    ({timeFrameLabel})
                  </span>
                </h3>
              </div>
              <Outlet context={outletContext} />
            </div>
          </div>

          {/* right side */}
          <div className={styles.grid.rightColumn}>
            <div className={styles.cards.base}>
              <div className={styles.transactions.cardHeader}>
                <h3 className={styles.transactions.cardTitle}>
                  <Clock className=" w-6 h-6 text-purple-500" />
                  Recent Transactions
                </h3>
                <button
                  onClick={fetchTransactions}
                  disabled={loading}
                  className={styles.transactions.refreshButton}
                >
                  <RefreshCw
                    className={styles.transactions.refreshIcon(loading)}
                  />
                </button>
              </div>

              <div className={styles.transactions.dataStackingInfo}>
                <Info className={styles.transactions.dataStackingIcon} />
                <span>Transactions are stacked by date (newest first)</span>
              </div>

              <div className={styles.transactions.listContainer}>
                {displayedTransactions.map((transaction) => {
                  const { id, type, category, description, date, amount } =
                    transaction;
                  return (
                    <div
                      key={id}
                      className={styles.transactions.transactionItem}
                    >
                      <div className=" flex items-center gap-1 md:gap-4 lg:gap-3">
                        <div
                          className={`p-2 rounded-lg ${styles.colors.transaction.bg(
                            type,
                          )}`}
                        >
                          {CATEGORY_ICONS[category] || (
                            <DollarSign className={styles.transactions.icon} />
                          )}
                        </div>

                        <div className={styles.transactions.details}>
                          <p className={styles.transactions.description}>
                            {description}
                          </p>

                          <p className={styles.transactions.meta}>
                            {new Date(date).toLocaleDateString()}
                            <span className=" ml-2 capitalize">{category}</span>
                          </p>
                        </div>
                      </div>

                      <span className={styles.colors.transaction.text(type)}>
                        {type === "income" ? "+" : "-"}₹{Number(amount)}
                      </span>
                    </div>
                  );
                })}

                {transactions.length === 0 ? (
                  <div className={styles.transactions.emptyState}>
                    <div className={styles.transactions.emptyIconContainer}>
                      <Clock className={styles.transactions.emptyIcon} />
                    </div>
                    <p className={styles.transactions.emptyText}>
                      No recent transactions
                    </p>
                  </div>
                ) : (
                  <div className={styles.transactions.viewAllContainer}>
                    <button
                      onClick={() =>
                        setShowAllTransactions(!showAllTransactions)
                      }
                      className={styles.transactions.viewAllButton}
                    >
                      {showAllTransactions ? (
                        <>
                          <ChevronUp className=" w-5 h-5" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className=" w-5 h-5" />
                          View All Transactions ({transactions.length})
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* spending by category card */}
            <div className={styles.cards.base}>
              <h3 className={styles.categories.title}>
                <PieChart className={styles.categories.titleIcon} />
                Spending by Category
              </h3>

              <div className={styles.categories.list}>
                {topCategories.map(([category, amount]) => (
                  <div
                    key={category}
                    className={styles.categories.categoryItem}
                  >
                    <div className=" flex items-center gap-3">
                      <div className={styles.categories.categoryIconContainer}>
                        {CATEGORY_ICONS[category] || (
                          <DollarSign
                            className={styles.categories.categoryIcon}
                          />
                        )}
                      </div>
                      <span className={styles.categories.categoryName}>
                        {category}
                      </span>
                    </div>
                    <span className={styles.categories.categoryAmount}>
                      ₹{amount}
                    </span>
                  </div>
                ))}
              </div>

              <div className={styles.categories.summaryContainer}>
                <div className={styles.categories.summaryGrid}>
                  <div className={styles.categories.summaryIncomeCard}>
                    <p className={styles.categories.summaryTitle}>
                      Total Income
                    </p>
                    <p className={styles.categories.summaryValue}>
                      ₹{stats.allTimeIncome.toLocaleString()}
                    </p>
                  </div>

                  <div className={styles.categories.summaryExpenseCard}>
                    <p className={styles.categories.summaryTitle}>
                      Total Expense
                    </p>
                    <p className={styles.categories.summaryValue}>
                      ₹{stats.allTimeExpenses.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layout;

```

## frontend/src/components/Login.jsx

```javascript
import React, { useState } from "react";
import { loginStyles } from "../assets/dummyStyles";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_URL as DEFAULT_API_URL } from "../config/api";

const Login = ({ onLogin, API_URL = DEFAULT_API_URL }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // to fetch profile
  const fetchProfile = async (token) => {
    if (!token) return null;
    const res = await axios.get(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  };

  const persistAuth = (profile, token) => {
    const storage = rememberMe ? localStorage : sessionStorage;
    try {
      if (token) storage.setItem("token", token);
      if (profile) storage.setItem("user", JSON.stringify(profile));
    } catch (err) {
      console.error("Storage Error:", err);
    }
  };

  // to login
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await axios.post(
        `${API_URL}/api/user/login`,
        { email, password },
        { headers: { "Content-Type": "application/json" } },
      );
      const data = res.data || {};
      const token = data.token || null;

      // to derive user profile
      let profile = data.user ?? null;
      if (!profile) {
        const copy = { ...data };
        delete copy.token;
        delete copy.user;

        if (Object.keys(copy).length) {
          profile = copy;
        }
      }

      if (!profile && token) {
        try {
          profile = await fetchProfile(token);
        } catch (fetchErr) {
          console.warn("Could not fetch profile after login token:", fetchErr);
          profile = { email };
        }
      }

      if (!profile) profile = { email };
      persistAuth(profile, token);

      if (typeof onLogin === "function") {
        try {
          onLogin(profile, rememberMe, token);
        } catch (callErr) {
          console.warn("onLogin threw:", callErr);
          navigate("/");
        }
      } else {
        navigate("/");
      }
      setPassword("");
    } catch (err) {
      console.error("Login error:", err?.response || err);
      const serverMsg =
        err.response?.data?.message ||
        (err.response?.data ? JSON.stringify(err.response.data) : null) ||
        err.message ||
        "Login failed";
      setError(serverMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={loginStyles.pageContainer}>
      <div className={loginStyles.cardContainer}>
        <div className={loginStyles.header}>
          <div className={loginStyles.avatar}>
            <User className=" w-10 h-10 text-white" />
          </div>
          <h1 className={loginStyles.headerTitle}>Welcome Back</h1>
          <p className={loginStyles.headerSubtitle}>
            Sign in to your Budget Buddy account
          </p>
        </div>

        <div className={loginStyles.formContainer}>
          {error && (
            <div className={loginStyles.errorContainer}>
              <div className={loginStyles.errorIcon}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <span className={loginStyles.errorText}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className=" mb-6">
              <label htmlFor="email" className={loginStyles.label}>
                Email Address
              </label>
              <div className={loginStyles.inputContainer}>
                <div className={loginStyles.inputIcon}>
                  <Mail className=" w-5 h-5" />
                </div>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={loginStyles.input}
                  placeholder="your@example.com"
                  required
                />
              </div>
            </div>

            <div className=" mb-6">
              <label htmlFor="password" className={loginStyles.label}>
                Password
              </label>
              <div className={loginStyles.inputContainer}>
                <div className={loginStyles.inputIcon}>
                  <Lock className=" w-5 h-5" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={loginStyles.passwordInput}
                  placeholder="●●●●●●"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={loginStyles.passwordToggle}
                >
                  {showPassword ? (
                    <EyeOff className=" w-5 h-5" />
                  ) : (
                    <Eye className=" w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className={loginStyles.checkboxContainer}>
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={loginStyles.checkbox}
                required
              />
              <label htmlFor="remember" className={loginStyles.checkboxLabel}>
                Remember Me
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`${loginStyles.button} ${
                isLoading ? loginStyles.buttonDisabled : ""
              }`}
            >
              {isLoading ? (
                <>
                  <svg
                    className={loginStyles.spinner}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className={loginStyles.signUpContainer}>
            <p className={loginStyles.signUpText}>
              Don't have an account{" "}
              <Link to="/signup" className={loginStyles.signUpLink}>
                Create One
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

```

## frontend/src/components/Navbar.jsx

```javascript
import React, { useEffect, useRef, useState } from "react";
import { navbarStyles } from "../assets/dummyStyles";
import img1 from "../assets/logo.png";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE as BASE_URL } from "../config/api";

const Navbar = ({ user: propUser, onLogout }) => {
  const navigate = useNavigate();
  const menuRef = useRef();
  const [menuOpen, setMenuOpen] = useState(false);

  const user = propUser || {
    name: "",
    email: "",
  };

  //   to fetch the user data from server
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const response = await axios.get(`${BASE_URL}/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userData = response.data.user || response.data;
        setUser(userData);
      } catch (error) {
        console.error("Failed to load profile", error);
      }
    };

    if (!propUser) {
      fetchUserData();
    }
  }, [propUser]);

  const toggleMenu = () => setMenuOpen((prev) => !prev);

  const handleLogout = () => {
    setMenuOpen(false);
    localStorage.removeItem("token");
    onLogout?.();
    navigate("/login");
  };

  // closes the toggle menu if click outside the box
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className={navbarStyles.header}>
      <div className={navbarStyles.container}>
        {/* logo */}
        <div
          onClick={() => navigate("/")}
          className={navbarStyles.logoContainer}
        >
          <div className={navbarStyles.logoImage}>
            <img src={img1} alt="logo" />
          </div>
          <span className={navbarStyles.logoText}>Budget Buddy</span>
        </div>

        {/* if the user is present */}
        {user && (
          <div className={navbarStyles.userContainer} ref={menuRef}>
            <button onClick={toggleMenu} className={navbarStyles.userButton}>
              <div className=" relative">
                <div className={navbarStyles.userAvatar}>
                  {user?.name?.[0]?.toUpperCase() || "U"}
                </div>
                <div className={navbarStyles.statusIndicator}></div>
              </div>
              <div className={navbarStyles.userTextContainer}>
                <p className={navbarStyles.userName}>{user?.name || "User"}</p>
                <p className={navbarStyles.userEmail}>
                  {user?.email || "user@expensetracker.com"}
                </p>
              </div>

              <ChevronDown className={navbarStyles.chevronIcon(menuOpen)} />
            </button>

            {/* dropdown menu */}
            {menuOpen && (
              <div className={navbarStyles.dropdownMenu}>
                <div className={navbarStyles.dropdownHeader}>
                  <div className=" flex items-center gap-3">
                    <div className={navbarStyles.dropdownAvatar}>
                      {user?.name?.[0]?.toUpperCase() || "U"}
                    </div>

                    <div>
                      <div className={navbarStyles.dropdownName}>
                        {user?.name || "User"}
                      </div>
                      <div className={navbarStyles.dropdownEmail}>
                        {user?.email || "user@expensetracker.com"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={navbarStyles.menuItemContainer}>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/profile");
                    }}
                    className={navbarStyles.menuItem}
                  >
                    <User className=" w-4 h-4" />
                    <span>My Profile</span>
                  </button>
                </div>

                <div className={navbarStyles.menuItemBorder}>
                  <button
                    onClick={handleLogout}
                    className={navbarStyles.logoutButton}
                  >
                    <LogOut className=" w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;

```

## frontend/src/components/Sidebar.jsx

```javascript
import React, { useEffect, useRef, useState } from "react";
import { sidebarStyles, cn } from "../assets/dummyStyles";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Home,
  LogOut,
  Menu,
  User,
  X,
} from "lucide-react";

const MENU_ITEMS = [
  { text: "Dashboard", path: "/", icon: <Home size={20} /> },
  { text: "Income", path: "/income", icon: <ArrowUp size={20} /> },
  { text: "Expenses", path: "/expense", icon: <ArrowDown size={20} /> },
  { text: "Profile", path: "/profile", icon: <User size={20} /> },
];

const Sidebar = ({ user, isCollapsed, setIsCollapsed }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeHover, setActiveHover] = useState(null);

  const { name: username = "User", email = "user@example.com" } = user || {};
  const initial = username.charAt(0).toUpperCase();

  // to check for overflow in mobile
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [mobileOpen]);

  //click outside sidebar get collapsed
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        mobileOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target)
      ) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileOpen]);

  // to logout
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const toggleSidebar = () => setIsCollapsed((c) => !c);

  // a small component
  const renderMenuItem = ({ text, path, icon }) => {
    const isActive = pathname === path;
    return (
      <motion.li
        key={text}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Link
          to={path}
          className={cn(
            sidebarStyles.menuItem.base,
            isActive
              ? sidebarStyles.menuItem.active
              : sidebarStyles.menuItem.inactive,
            isCollapsed
              ? sidebarStyles.menuItem.collapsed
              : sidebarStyles.menuItem.expanded,
          )}
          onMouseEnter={() => setActiveHover(text)}
          onMouseLeave={() => setActiveHover(null)}
        >
          <span
            className={
              isActive
                ? sidebarStyles.menuIcon.active
                : sidebarStyles.menuIcon.inactive
            }
          >
            {icon}
          </span>
          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
            >
              {text}
            </motion.span>
          )}
          {activeHover === text && !isActive && !isCollapsed && (
            <span className={sidebarStyles.activeIndicator}></span>
          )}
        </Link>
      </motion.li>
    );
  };

  return (
    <>
      <motion.div
        ref={sidebarRef}
        className={sidebarStyles.sidebarContainer.base}
        initial={{ x: -100, opacity: 0 }}
        animate={{
          x: 0,
          opacity: 1,
          width: isCollapsed ? 80 : 256,
        }}
        transition={{ type: "spring", damping: 25 }}
      >
        <div className={sidebarStyles.sidebarInner.base}>
          <button
            onClick={toggleSidebar}
            className={sidebarStyles.toggleButton.base}
          >
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: isCollapsed ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline
                  points={isCollapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}
                ></polyline>
              </svg>
            </motion.div>
          </button>

          <div
            className={cn(
              sidebarStyles.userProfileContainer.base,
              isCollapsed
                ? sidebarStyles.userProfileContainer.collapsed
                : sidebarStyles.userProfileContainer.expanded,
            )}
          >
            <div className=" flex items-center">
              <div className={sidebarStyles.userInitials.base}>{initial}</div>
              {!isCollapsed && (
                <motion.div
                  className="ml-3 overflow-hidden"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                >
                  <h2 className="text-sm font-bold text-gray-800 truncate">
                    {username}
                  </h2>
                  <p className=" text-xs text-gray-500 truncate">{email}</p>
                </motion.div>
              )}
            </div>
          </div>

          <div className=" flex-1 overflow-y-auto py-4 custom-scrollbar">
            <ul className={sidebarStyles.menuList.base}>
              {MENU_ITEMS.map(renderMenuItem)}
            </ul>
          </div>

          <div
            className={cn(
              sidebarStyles.footerContainer.base,
              isCollapsed
                ? sidebarStyles.footerContainer.collapsed
                : sidebarStyles.footerContainer.expanded,
            )}
          >
            <button
              onClick={handleLogout}
              className={cn(
                sidebarStyles.logoutButton.base,
                isCollapsed && sidebarStyles.logoutButton.collapsed,
              )}
            >
              <LogOut size={20} className=" text-gray-500" />
              {!isCollapsed && <span>Logout</span>}
            </button>
          </div>
        </div>
      </motion.div>

      <motion.button
        onClick={() => setMobileOpen((prev) => !prev)}
        className={sidebarStyles.mobileMenuButton}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </motion.button>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className={sidebarStyles.mobileOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={sidebarStyles.mobileBackdrop}
              onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              ref={sidebarRef}
              className={sidebarStyles.mobileSidebar.base}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className=" relative h-full flex flex-col">
                <div className={sidebarStyles.mobileHeader}>
                  <div className={sidebarStyles.mobileUserContainer}>
                    <div className={sidebarStyles.userInitials.base}>
                      {initial}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">
                        {username}
                      </h2>
                      <p className=" text-sm text-gray-500">{email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className={sidebarStyles.mobileCloseButton}
                  >
                    <X size={24} className=" text-gray-600" />
                  </button>
                </div>

                <div className=" flex-1 overflow-y-auto py-4">
                  <ul className={sidebarStyles.mobileMenuList}>
                    {MENU_ITEMS.map(({ text, path, icon }) => (
                      <motion.li key={text} whileTap={{ scale: 0.98 }}>
                        <Link
                          to={path}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            sidebarStyles.mobileMenuItem.base,
                            pathname === path
                              ? sidebarStyles.mobileMenuItem.active
                              : sidebarStyles.mobileMenuItem.inactive,
                          )}
                        >
                          <span
                            className={
                              pathname === path
                                ? sidebarStyles.menuIcon.active
                                : sidebarStyles.menuIcon.inactive
                            }
                          >
                            {icon}
                          </span>
                          <span>{text}</span>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                <div className={sidebarStyles.mobileFooter}>
                  <button
                    onClick={handleLogout}
                    className={sidebarStyles.mobileLogoutButton}
                  >
                    <LogOut size={20} className=" text-gray-500" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;

```

## frontend/src/components/Signup.jsx

```javascript
import React, { useState } from "react";
import { signupStyles } from "../assets/dummyStyles";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { API_URL as DEFAULT_API_URL } from "../config/api";

const Signup = ({ API_URL = DEFAULT_API_URL, onSignup }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // to fetch profile
  const fetchProfile = async (token) => {
    if (!token) return null;
    const res = await axios.get(`${API_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  };

  const persistAuth = (profile, token) => {
    const storage = rememberMe ? localStorage : sessionStorage;
    try {
      if (token) storage.setItem("token", token);
      if (profile) storage.setItem("user", JSON.stringify(profile));
    } catch (err) {
      console.error("Storage Error:", err);
    }
  };

  //   to validate that all fields are filled by user or not
  const validateForm = () => {
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email is invalid";
    }
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  //   to signup
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/user/register`,
        { name, email, password },
        { headers: { "Content-Type": "application/json" } },
      );
      const data = res.data || {};
      const token = data.token ?? null;
      let profile = data.user ?? null;
      if (!profile) {
        // check for any extra fields returned that could be user info
        const copy = { ...data };
        delete copy.token;
        delete copy.user;
        if (Object.keys(copy).length) profile = copy;
      }

      if (!profile && token) {
        try {
          profile = await fetchProfile(token);
        } catch (fetchErr) {
          console.warn("Could not fetch profile after signup token:", fetchErr);
          profile = null;
        }
      }

      if (!profile) profile = { name, email };
      persistAuth(profile, token);
      if (typeof onSignup === "function") {
        try {
          onSignup(profile, rememberMe, token);
        } catch (callErr) {
          console.warn("onSignup threw:", callErr);
          navigate("/");
        }
      } else {
        navigate("/");
      }
      setPassword("");
    } catch (err) {
      console.error("Signup error:", err?.response || err);
      if (err.response?.data?.errors) {
        setErrors(err.response.data.errors);
      } else if (err.response?.data?.message) {
        setErrors({ api: err.response.data.message });
      } else {
        setErrors({ api: err.message || "An unexpected error occurred" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={signupStyles.pageContainer}>
      <div className={signupStyles.cardContainer}>
        <div className={signupStyles.header}>
          <button
            onClick={() => navigate(-1)}
            className={signupStyles.backButton}
          >
            <ArrowLeft className=" w-5 h-5" />
          </button>

          <div className={signupStyles.avatar}>
            <User className=" w-10 h-10 text-white" />
          </div>
          <h1 className={signupStyles.headerTitle}>Create Account</h1>
          <p className={signupStyles.headerSubtitle}>
            Join Budget Buddy to manage your finances
          </p>
        </div>

        <div className={signupStyles.formContainer}>
          {errors.api && <p className={signupStyles.apiError}>{errors.api}</p>}

          <form onSubmit={handleSubmit} noValidate>
            <div className=" mb-6">
              <label htmlFor="name" className={signupStyles.label}>
                Full Name
              </label>
              <div className={signupStyles.inputContainer}>
                <div className={signupStyles.inputIcon}>
                  <User className=" w-5 h-5" />
                </div>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${signupStyles.input} ${
                    errors.name ? "border-red-300" : "border-gray-200"
                  }`}
                  placeholder="John Doe"
                />
              </div>

              {errors.name && (
                <p className={signupStyles.fieldError}>{errors.name}</p>
              )}
            </div>

            <div className=" mb-6">
              <label htmlFor="email" className={signupStyles.label}>
                Email Address
              </label>
              <div className={signupStyles.inputContainer}>
                <div className={signupStyles.inputIcon}>
                  <Mail className=" w-5 h-5" />
                </div>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${signupStyles.input} ${
                    errors.email ? "border-red-300" : "border-gray-200"
                  }`}
                  placeholder="your@example.com"
                />
              </div>

              {errors.email && (
                <p className={signupStyles.fieldError}>{errors.email}</p>
              )}
            </div>

            <div className=" mb-6">
              <label htmlFor="password" className={signupStyles.label}>
                Password
              </label>
              <div className={signupStyles.inputContainer}>
                <div className={signupStyles.inputIcon}>
                  <Lock className=" w-5 h-5" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${signupStyles.passwordInput} ${
                    errors.password ? "border-red-300" : "border-gray-200"
                  }`}
                  placeholder="●●●●●●"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={signupStyles.passwordToggle}
                >
                  {showPassword ? (
                    <EyeOff className=" w-5 h-5" />
                  ) : (
                    <Eye className=" w-5 h-5" />
                  )}
                </button>
              </div>

              {errors.password && (
                <p className={signupStyles.fieldError}>{errors.password}</p>
              )}
            </div>

            <div className={signupStyles.checkboxContainer}>
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={signupStyles.checkbox}
              />

              <label htmlFor="remember" className={signupStyles.checkboxLabel}>
                Remember Me
              </label>
            </div>

            <button
              type="submit"
              className={`${signupStyles.button} ${
                isLoading ? signupStyles.buttonDisabled : ""
              }`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg
                    className={signupStyles.spinner}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2-647z"
                    ></path>
                  </svg>
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className={signupStyles.signInContainer}>
            <p className={signupStyles.signInText}>
              Already have an account?{" "}
              <Link to="/login" className={signupStyles.signInLink}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;

```

## frontend/src/components/TimeFrame.jsx

```javascript
import React from "react";

const TimeFrameSelector = ({
  timeFrame,
  setTimeFrame,
  options,
  color = "teal",
  style = "default",
}) => {
  const colorClass = {
    teal: "bg-teal-500",
    orange: "bg-orange-500",
    cyan: "bg-cyan-500",
  }[color];

  const styleClass = {
    default:
      "flex gap-2 bg-white p-1 -mx-11 lg:-mx-0 md:-mx-0 rounded-xl border border-gray-200",
    minimal: "flex gap-2",
  }[style];

  return (
    <div className={styleClass}>
      {options.map((frame) => (
        <button
          key={frame}
          onClick={() => setTimeFrame(frame)}
          className={`px-2  py-2 text-sm rounded-lg transition-all ${
            timeFrame === frame
              ? `${colorClass} text-white`
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          {frame.charAt(0).toUpperCase() + frame.slice(1)}
        </button>
      ))}
    </div>
  );
};

export default TimeFrameSelector;

//it shows the 3 boxes with the details
// like Total Income,Average Income, Transactions

```

## frontend/src/components/TransactionItem.jsx

```javascript
import React, { useState } from "react";
import { transactionItemStyles } from "../assets/dummyStyles";
import { colorClasses } from "../assets/color";
import { DollarSign, Edit, Save, Trash2, X } from "lucide-react";

const TransactionItem = ({
  transaction,
  isEditing,
  editForm,
  setEditForm,
  onSave,
  onCancel,
  onDelete,
  type = "expense",
  categoryIcons,
  setEditingId,
  amountClass = "font-bold truncate block text-right",
  iconClass = "p-3 rounded-xl flex-shrink-0",
}) => {
  const [errors, setErrors] = useState({ description: "", amount: "" });

  const classes = colorClasses[type];
  const sign = type === "income" ? "+" : "-";

  const validate = () => {
    const nextErrors = { description: "", amount: "" };
    const desc = String(editForm.description ?? "").trim();
    const amtRaw = editForm.amount;
    const amt =
      amtRaw === "" || amtRaw === null || amtRaw === undefined
        ? ""
        : String(amtRaw).trim();

    if (!desc) {
      nextErrors.description = "Description is required.";
    }

    if (amt === "") {
      nextErrors.amount = "Amount is required.";
    } else if (Number(amt) <= 0) {
      nextErrors.amount = "Amount must be greater than 0.";
    }

    setErrors(nextErrors);
    return !nextErrors.description && !nextErrors.amount;
  };

  const handleSaveClick = () => {
    if (validate()) {
      setErrors({ description: "", amount: "" });
      onSave();
    }
  }; //to save the desc and amt

  return (
    <div className={transactionItemStyles.container(isEditing, classes)}>
      <div className={transactionItemStyles.mainContainer}>
        <div
          className={transactionItemStyles.iconContainer(iconClass, classes)}
        >
          {categoryIcons[transaction.category] || (
            <DollarSign className=" w-5 h-5" />
          )}
        </div>

        <div className={transactionItemStyles.contentContainer}>
          {isEditing ? (
            <>
              <input
                type="text"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                className={transactionItemStyles.input(
                  !!errors.description,
                  classes,
                )}
              />
              {errors.description && (
                <p
                  className={transactionItemStyles.errorText}
                  id={`desc-error-${transaction.id}`}
                >
                  {errors.description}
                </p>
              )}
            </>
          ) : (
            <p className={transactionItemStyles.description}>
              {transaction.description}
            </p>
          )}

          <p className={transactionItemStyles.details}>
            {new Date(transaction.date).toLocaleDateString()} ●{" "}
            {transaction.category}
          </p>
        </div>
      </div>

      <div className={transactionItemStyles.actionsContainer}>
        <div className={transactionItemStyles.amountContainer}>
          {isEditing ? (
            <>
              <input
                type="number"
                value={editForm.amount}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, amount: e.target.value }))
                }
                className={transactionItemStyles.amountInput(
                  !!errors.amount,
                  classes,
                )}
              />
              {errors.amount && (
                <p
                  id={`amt-error-${transaction.id}`}
                  className={transactionItemStyles.errorText}
                >
                  {errors.amount}
                </p>
              )}
            </>
          ) : (
            <span
              className={transactionItemStyles.amountText(amountClass, classes)}
            >
              {sign}₹
              {Number(transaction.amount).toLocaleString("en-US", {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            </span>
          )}
        </div>

        <div className={transactionItemStyles.buttonsContainer}>
          {isEditing ? (
            <>
              <button
                onClick={handleSaveClick}
                className={transactionItemStyles.saveButton(classes)}
                title="Save"
              >
                <Save size={16} />
              </button>

              <button
                onClick={() => {
                  setErrors({ description: "", amount: "" });
                  onCancel();
                }}
                className={transactionItemStyles.cancelButton}
                title="Cancel"
              >
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setEditForm({
                    description: transaction.description ?? "",
                    amount: transaction.amount ?? "",
                    category: transaction.category ?? "",
                    date: transaction.date ?? "",
                    type: transaction.type ?? "expense",
                  });
                  setErrors({ description: "", amount: "" });
                  setEditingId(transaction.id);
                }}
                className={transactionItemStyles.editButton(classes)}
                title="Edit"
              >
                <Edit size={16} />
              </button>

              <button
                onClick={() => onDelete(transaction.id)}
                className={transactionItemStyles.deleteButton(classes)}
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionItem;

```

## frontend/src/config/api.js

```javascript
const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const API_URL = rawApiUrl.replace(/\/$/, "");
export const API_BASE = `${API_URL}/api`;

```

## frontend/src/index.css

```css
@import "tailwindcss";

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.2);
}

.modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 16px;
    outline: none;
    padding: 0;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

@media (max-width: 640px) {
    .modal {
        width: 90%;
        max-width: none;
    }
}

.lobster-regular {
    font-family: "Lobster", sans-serif;
    font-weight: 400;
    font-style: normal;
}
```

## frontend/src/main.jsx

```javascript
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { BrowserRouter } from "react-router-dom";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);

```

## frontend/src/pages/Dashboard.jsx

```javascript
import React, { useEffect, useMemo, useState } from "react";
import {
  dashboardStyles,
  trendStyles,
  chartStyles,
} from "../assets/dummyStyles";
import {
  GAUGE_COLORS,
  COLORS,
  INCOME_CATEGORY_ICONS,
  EXPENSE_CATEGORY_ICONS,
} from "../assets/color";
import { useOutletContext } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import {
  getTimeFrameRange,
  getPreviousTimeFrameRange,
  calculateData,
} from "../components/Helpers";
import axios from "axios";
import {
  ArrowDown,
  BarChart2,
  ChevronDown,
  TrendingUp as ProfitIcon,
  PieChart as PieChartIcon,
  ChevronUp,
  DollarSign,
  PiggyBank,
  Plus,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import FinancialCard from "../components/FinancialCard";
import GaugeCard from "../components/GaugeCard";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import AddTransactionModal from "../components/Add";
import { API_BASE } from "../config/api";

const getAuthHeader = () => {
  const token =
    localStorage.getItem("token") || localStorage.getItem("authToken");
  return token ? { Authorization: `Bearer ${token} ` } : {};
};

// to convert date to ISO timeline
function toIsoWithClientTime(dateValue) {
  if (!dateValue) {
    return new Date().toISOString();
  }

  if (typeof dateValue === "string" && dateValue.length === 10) {
    const now = new Date();
    const hhmmss = now.toTimeString().slice(0, 8);
    const combined = new Date(`${dateValue}T${hhmmss}`);
    return combined.toISOString();
  }

  try {
    return new Date(dateValue).toISOString();
  } catch (err) {
    return new Date().toISOString();
  }
}

const Dashboard = () => {
  //get refreshTransactions from the outlet context
  const {
    transactions: outletTransactions = [],
    timeFrame = "monthly",
    setTimeFrame = () => {},
    refreshTransactions,
  } = useOutletContext();

  const [showModal, setShowModal] = useState(false);
  const [gaugeData, setGaugeData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [overviewMeta, setOverviewMeta] = useState({});
  const [showAllIncome, setShowAllIncome] = useState(false); //to toggle
  const [showAllExpense, setShowAllExpense] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("25");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    amount: "",
    type: "expense", //or income
    category: "Food",
  });

  const timeFrameRange = useMemo(
    () => getTimeFrameRange(timeFrame),
    [timeFrame],
  );
  const prevTimeFrameRange = useMemo(
    () => getPreviousTimeFrameRange(timeFrame),
    [timeFrame],
  );

  //function to check if a date is within the range
  const isDateInRange = (date, start, end) => {
    const transactionDate = new Date(date);
    const startDate = new Date(start);
    const endDate = new Date(end);
    transactionDate.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return transactionDate >= startDate && transactionDate <= endDate;
  };

  //to filter using date and time
  const filteredTransactions = useMemo(
    () =>
      (outletTransactions || []).filter((t) =>
        isDateInRange(t.date, timeFrameRange.start, timeFrameRange.end),
      ),
    [outletTransactions, timeFrameRange],
  );

  const prevFilteredTransactions = useMemo(
    () =>
      (outletTransactions || []).filter((t) =>
        isDateInRange(t.date, prevTimeFrameRange.start, prevTimeFrameRange.end),
      ),
    [outletTransactions, prevTimeFrameRange],
  );

  //calculate data
  const currentTimeFrameData = useMemo(() => {
    const data = calculateData(filteredTransactions);
    data.savings = data.income - data.expenses;
    return data;
  }, [filteredTransactions]);

  const prevTimeFrameData = useMemo(() => {
    const data = calculateData(prevFilteredTransactions);
    data.savings = data.income - data.expenses;
    return data;
  }, [prevFilteredTransactions]);

  //update the gauge when time frame changes
  useEffect(() => {
    const maxValues = {
      income: Math.max(currentTimeFrameData.income, 5000),
      expenses: Math.max(currentTimeFrameData.expenses, 3000),
      savings: Math.max(Math.abs(currentTimeFrameData.savings), 2000),
    };

    setGaugeData([
      {
        name: "Income",
        value: currentTimeFrameData.income,
        max: maxValues.income,
      },
      {
        name: "Spent",
        value: currentTimeFrameData.expenses,
        max: maxValues.expenses,
      },
      {
        name: "Savings",
        value: currentTimeFrameData.savings,
        max: maxValues.savings,
      },
    ]);
  }, [currentTimeFrameData, timeFrame]); //the graph will be fill according to this data.

  const displayIncome =
    timeFrame === "monthly" && typeof overviewMeta.monthlyIncome === "number"
      ? overviewMeta.monthlyIncome
      : currentTimeFrameData.income;

  const displayExpenses =
    timeFrame === "monthly" && typeof overviewMeta.monthlyExpense === "number"
      ? overviewMeta.monthlyExpense
      : currentTimeFrameData.expenses;

  const displaySavings =
    timeFrame === "monthly" && typeof overviewMeta.savings === "number"
      ? overviewMeta.savings
      : currentTimeFrameData.savings;

  //expense change percentage
  const expenseChange = useMemo(() => {
    const prev = prevTimeFrameData.expenses;
    const curr = displayExpenses;
    if (!prev) {
      if (!curr) return 0;
      return 100;
    }
    return Math.round(((curr - prev) / prev) * 100);
  }, [prevTimeFrameData, displayExpenses]);

  //expense distribution
  const financialOverviewData = useMemo(() => {
    if (
      timeFrame === "monthly" &&
      overviewMeta.expenseDistribution &&
      Array.isArray(overviewMeta.expenseDistribution) &&
      overviewMeta.expenseDistribution.length > 0
    ) {
      return overviewMeta.expenseDistribution.map((d) => ({
        name: d.category,
        value: Math.round(Number(d.amount) || 0),
      }));
    }

    const categories = {};
    filteredTransactions.forEach((transaction) => {
      if (transaction.type === "expense") {
        categories[transaction.category] =
          (categories[transaction.category] || 0) + transaction.amount;
      }
    });

    return Object.keys(categories).map((category) => ({
      name: category,
      value: Math.round(categories[category]),
    }));
  }, [filteredTransactions, overviewMeta, timeFrame]);

  // build server-provided recent list
  const serverRecent = overviewMeta.recentTransactions || [];
  const serverRecentIncome = serverRecent
    .filter((t) => t.type === "income")
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const serverRecentExpense = serverRecent
    .filter((t) => t.type === "expense")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const incomeTransactions = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.type === "income")
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [filteredTransactions],
  );

  const expenseTransactions = useMemo(
    () =>
      filteredTransactions
        .filter((t) => t.type === "expense")
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [filteredTransactions],
  );

  const incomeListForDisplay =
    timeFrame === "monthly" && serverRecentIncome.length > 0
      ? serverRecentIncome
      : incomeTransactions;

  const expenseListForDisplay =
    timeFrame === "monthly" && serverRecentExpense.length > 0
      ? serverRecentExpense
      : expenseTransactions;

  const displayedIncome = showAllIncome
    ? incomeListForDisplay
    : incomeListForDisplay.slice(0, 3); //show 3 then a toggle button

  const displayedExpense = showAllExpense
    ? expenseListForDisplay
    : expenseListForDisplay.slice(0, 3);

  // fetch the server-side data
  const fetchDashboardOverview = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/dashboard`, {
        headers: getAuthHeader(),
      });

      if (res?.data?.success) {
        const data = res.data.data;

        const recent = (data.recentTransactions || []).map((item) => {
          const typeFromServer =
            item.type || (item.category ? "expense" : "income");
          const amountNum = Number(item.amount) || 0;

          const isoDate = item.date
            ? new Date(item.date).toISOString()
            : item.createdAt
              ? new Date(item.createdAt).toISOString()
              : new Date().toISOString();

          return {
            id: item._id || item.id || Date.now() + Math.random(),
            date: isoDate,
            description:
              item.description ||
              item.note ||
              item.title ||
              (typeFromServer === "income"
                ? item.source || "Income"
                : item.category || "Expense"),
            amount: amountNum,
            type: typeFromServer,
            category:
              item.category ||
              (typeFromServer === "income" ? "Salary" : "Other"),
            raw: item,
          };
        });

        setOverviewMeta((prev) => ({
          ...prev,
          monthlyIncome: Number(data.monthlyIncome || 0),
          monthlyExpense: Number(data.monthlyExpense || 0),
          savings:
            typeof data.savings !== "undefined"
              ? Number(data.savings)
              : Number(data.monthlyIncome || 0) -
                Number(data.monthlyExpense || 0),
          savingsRate:
            typeof data.savingsRate !== "undefined" ? data.savingsRate : null,
          spendByCategory: data.spendByCategory || {},
          expenseDistribution: data.expenseDistribution || [],
          recentTransactions: recent,
        }));

        if (timeFrame === "monthly") {
          const monthlyIncome = Number(data.monthlyIncome || 0);
          const monthlyExpense = Number(data.monthlyExpense || 0);
          const savings =
            typeof data.savings !== "undefined"
              ? Number(data.savings)
              : monthlyIncome - monthlyExpense;

          const maxValues = {
            income: Math.max(monthlyIncome, 5000),
            expenses: Math.max(monthlyExpense, 3000),
            savings: Math.max(Math.abs(savings), 2000),
          };

          setGaugeData([
            { name: "Income", value: monthlyIncome, max: maxValues.income },
            { name: "Spent", value: monthlyExpense, max: maxValues.expenses },
            { name: "Savings", value: savings, max: maxValues.savings },
          ]);
        }
      } else {
        console.warn("Dashboard endpoint returned success:false", res?.data);
      }
    } catch (err) {
      console.error(
        "Failed to fetch dashboard overview:",
        err?.response || err.message || err,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardOverview();
  }, []);

  const paymentStatus = searchParams.get("payment");

  // add/ edit or //delete
  const handleAddTransaction = async () => {
    if (!newTransaction.description || !newTransaction.amount) return;

    const payload = {
      date: toIsoWithClientTime(newTransaction.date),
      description: newTransaction.description,
      amount: parseFloat(newTransaction.amount),
      category: newTransaction.category,
    };

    try {
      setLoading(true);
      if (newTransaction.type === "income") {
        await axios.post(`${API_BASE}/income/add`, payload, {
          headers: getAuthHeader(),
        });
      } else {
        await axios.post(`${API_BASE}/expense/add`, payload, {
          headers: getAuthHeader(),
        });
      }
      await refreshTransactions();
      await fetchDashboardOverview();

      setNewTransaction({
        date: new Date().toISOString().split("T")[0],
        description: "",
        amount: "",
        type: "expense",
        category: "Food",
      });
      setShowModal(false);
    } catch (err) {
      console.error(
        "Failed to add Transactions:",
        err?.response || err.message || err,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
    const amount = Number(paymentAmount);

    if (!amount || amount <= 0) {
      return;
    }

    try {
      setPaymentLoading(true);
      const res = await axios.post(
        `${API_BASE}/payment/checkout`,
        {
          amount,
          description: "Budget Buddy wallet top-up",
        },
        {
          headers: getAuthHeader(),
        },
      );

      if (res?.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error(
        "Failed to start checkout:",
        err?.response || err.message || err,
      );
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleQRPaymentInitiate = (amount) => {
    setPaymentAmount(amount.toString());
    setTimeout(() => {
      handleStripeCheckout();
    }, 100);
  };

  const clearPaymentStatus = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("payment");
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className={dashboardStyles.container}>
      {/* Header */}
      <div className={dashboardStyles.headerContainer}>
        <div className={dashboardStyles.headerContent}>
          <div>
            <h1 className={dashboardStyles.headerTitle}>Finance Dashboard</h1>
            <p className={dashboardStyles.headerSubtitle}>
              Track your income and expenses
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className={dashboardStyles.addButton}
          >
            <Plus size={20} />
            Add Transaction
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Add funds with Stripe
              </h2>
              <p className="text-sm text-gray-500">
                Create a secure checkout session for a card payment.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="number"
                min="1"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none focus:border-teal-400 sm:w-32"
                placeholder="25.00"
              />
              <button
                onClick={handleStripeCheckout}
                disabled={paymentLoading}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-teal-300"
              >
                {paymentLoading ? "Redirecting..." : "Pay with Stripe"}
              </button>
            </div>
          </div>
        </div>

        {paymentStatus && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              paymentStatus === "success"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <span>
                {paymentStatus === "success"
                  ? "Payment completed in Stripe."
                  : "Payment was cancelled before completion."}
              </span>
              <button
                onClick={clearPaymentStatus}
                className="font-medium underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className={dashboardStyles.timeFrameContainer}>
          <div className={dashboardStyles.timeFrameWrapper}>
            {["daily", "weekly", "monthly"].map((frame) => (
              <button
                key={frame}
                onClick={() => setTimeFrame(frame)}
                className={dashboardStyles.timeFrameButton(timeFrame === frame)}
              >
                {frame.charAt(0).toUpperCase() + frame.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={dashboardStyles.summaryGrid}>
        <FinancialCard
          icon={
            <div className={dashboardStyles.walletIconContainer}>
              <Wallet className=" w-5 h-5 text-teal-600" />
            </div>
          }
          label="Total Balance"
          value={`₹${Math.round(displayIncome - displayExpenses).toLocaleString()}`}
          additionalContent={
            <div className=" flex items-center gap-2 mt-2 text-sm">
              <span className={dashboardStyles.balanceBadge}>
                +₹{Math.round(displayIncome).toLocaleString()}
              </span>
              <span className={dashboardStyles.expenseBadge}>
                -₹{Math.round(displayExpenses).toLocaleString()}
              </span>
            </div>
          }
        />

        <FinancialCard
          icon={
            <div className={dashboardStyles.arrowDownIconContainer}>
              <ArrowDown className=" w-5 h-5 text-orange-600" />
            </div>
          }
          label={`${timeFrameRange.label} Expenses`}
          value={`₹${Math.round(displayExpenses).toLocaleString()}`}
          additionalContent={
            <div
              className={`mt-2 text-xs flex items-center gap-1 ${
                expenseChange >= 0 ? trendStyles.positive : trendStyles.negative
              }`}
            >
              {expenseChange >= 0 ? (
                <TrendingUp className=" w-4 h-4" />
              ) : (
                <TrendingDown className=" w-4 h-4" />
              )}
              <span>
                {Math.abs(expenseChange)}%{" "}
                {expenseChange >= 0 ? "increase" : "decrease"} from{" "}
                {prevTimeFrameRange.label}
              </span>
            </div>
          }
        />

        <FinancialCard
          icon={
            <div className={dashboardStyles.piggyBankIconContainer}>
              <PiggyBank className=" w-5 h-5 text-cyan-600" />
            </div>
          }
          label={`${timeFrameRange.label} Savings`}
          value={`₹${Math.round(displaySavings).toLocaleString()}`}
          additionalContent={
            <div className=" mt-2 text-xs text-cyan-600 flex items-center gap-2">
              <div className=" flex items-center gap-1">
                <BarChart2 className=" w-4 h-4" />
                <span>
                  {displayIncome > 0
                    ? Math.round((displaySavings / displayIncome) * 100)
                    : 0}
                  % of income
                </span>
              </div>

              {typeof overviewMeta.savingsRate === "number" && (
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    overviewMeta.savingsRate < 0
                      ? trendStyles.negativeRate
                      : trendStyles.positiveRate
                  }`}
                >
                  {overviewMeta.savingsRate}%
                </span>
              )}
            </div>
          }
        />
      </div>

      {/* Gauges */}
      <div className={dashboardStyles.gaugeGrid}>
        {gaugeData.map((gauge) => (
          <GaugeCard
            key={gauge.name}
            gauge={gauge}
            colorInfo={GAUGE_COLORS[gauge.name]}
            timeFrameLabel={timeFrameRange.label}
          />
        ))}
      </div>

      {/* Expense distribution pie - Hidden on mobile */}
      <div className={dashboardStyles.pieChartContainer}>
        <div className={dashboardStyles.pieChartHeader}>
          <h3 className={dashboardStyles.pieChartTitle}>
            <PieChartIcon className="w-6 h-6 text-teal-500" />
            Expense Distribution
            <span className={dashboardStyles.listSubtitle}>
              {" "}
              ({timeFrameRange.label})
            </span>
          </h3>
        </div>

        <div className={dashboardStyles.pieChartHeight}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart className={chartStyles.pieChart}>
              <Pie
                data={financialOverviewData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name}: ${Math.round(percent * 100)}%`
                }
                labelLine={false}
              >
                {financialOverviewData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [
                  `₹${Math.round(value).toLocaleString()}`,
                  "Amount",
                ]}
                contentStyle={dashboardStyles.tooltipContent}
                itemStyle={dashboardStyles.tooltipItem}
              />
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                formatter={(v) => (
                  <span className={dashboardStyles.legendText}>{v}</span>
                )}
                iconSize={10}
                iconType="circle"
                wrapperStyle={dashboardStyles.legendWrapper}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={dashboardStyles.listsGrid}>
        {/* Income Column */}
        <div className={dashboardStyles.listContainer}>
          <div className={dashboardStyles.listHeader}>
            <h3 className={dashboardStyles.listTitle}>
              <ProfitIcon className="w-6 h-6 text-green-500" /> Recent Income{" "}
              <span className={dashboardStyles.listSubtitle}>
                {" "}
                ({timeFrameRange.label})
              </span>
            </h3>
            <span className={dashboardStyles.incomeCountBadge}>
              {incomeListForDisplay.length} records
            </span>
          </div>

          <div className={dashboardStyles.transactionList}>
            {displayedIncome.map((transaction) => {
              const IconComponent =
                INCOME_CATEGORY_ICONS[transaction.category] ||
                INCOME_CATEGORY_ICONS.Other;
              return (
                <div
                  key={transaction.id}
                  className={dashboardStyles.incomeTransactionItem}
                >
                  <div className={dashboardStyles.transactionContent}>
                    <div className={dashboardStyles.incomeIconContainer}>
                      {IconComponent}
                    </div>
                    <div>
                      <p className={dashboardStyles.transactionDescription}>
                        {transaction.description}
                      </p>
                      <p className={dashboardStyles.transactionCategory}>
                        {transaction.category}
                      </p>
                    </div>
                  </div>
                  <div className={dashboardStyles.transactionAmount}>
                    <p className={dashboardStyles.incomeAmount}>
                      +₹{Math.abs(transaction.amount).toLocaleString()}
                    </p>
                    <p className={dashboardStyles.transactionDate}>
                      {new Date(transaction.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}

            {incomeListForDisplay.length === 0 && (
              <div className={dashboardStyles.emptyState}>
                <div
                  className={dashboardStyles.emptyIconContainer("bg-green-50")}
                >
                  <DollarSign className="w-8 h-8 text-green-400" />
                </div>
                <p className={dashboardStyles.emptyText}>
                  No income transactions
                </p>
              </div>
            )}

            {incomeListForDisplay.length > 3 && (
              <div className={dashboardStyles.viewAllContainer}>
                <button
                  onClick={() => setShowAllIncome(!showAllIncome)}
                  className={dashboardStyles.viewAllButton}
                >
                  {showAllIncome ? (
                    <>
                      <ChevronUp className="w-5 h-5" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-5 h-5" />
                      View All Income ({incomeListForDisplay.length})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Expense Column */}
        <div className={dashboardStyles.listContainer}>
          <div className={dashboardStyles.listHeader}>
            <h3 className="text-lg md:text-xl lg:text-xl xl:text-xl font-bold text-gray-800 md:mt-3 mt-3 flex items-center gap-3">
              <ArrowDown className="w-6 h-6 text-orange-500" /> Recent Expenses{" "}
              <span className={dashboardStyles.listSubtitle}>
                {" "}
                ({timeFrameRange.label})
              </span>
            </h3>
            <span className={dashboardStyles.expenseCountBadge}>
              {expenseListForDisplay.length} records
            </span>
          </div>

          <div className={dashboardStyles.transactionList}>
            {displayedExpense.map((transaction) => {
              const IconComponent =
                EXPENSE_CATEGORY_ICONS[transaction.category] ||
                EXPENSE_CATEGORY_ICONS.Other;
              return (
                <div
                  key={transaction.id}
                  className={dashboardStyles.expenseTransactionItem}
                >
                  <div className={dashboardStyles.transactionContent}>
                    <div className={dashboardStyles.expenseIconContainer}>
                      {IconComponent}
                    </div>
                    <div>
                      <p className={dashboardStyles.transactionDescription}>
                        {transaction.description}
                      </p>
                      <p className={dashboardStyles.transactionCategory}>
                        {transaction.category}
                      </p>
                    </div>
                  </div>
                  <div className={dashboardStyles.transactionAmount}>
                    <p className={dashboardStyles.expenseAmount}>
                      -₹{Math.abs(transaction.amount).toLocaleString()}
                    </p>
                    <p className={dashboardStyles.transactionDate}>
                      {new Date(transaction.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}

            {expenseListForDisplay.length === 0 && (
              <div className={dashboardStyles.emptyState}>
                <div
                  className={dashboardStyles.emptyIconContainer("bg-orange-50")}
                >
                  <ShoppingCart className="w-8 h-8 text-orange-400" />
                </div>
                <p className={dashboardStyles.emptyText}>
                  No expense transactions
                </p>
              </div>
            )}

            {expenseListForDisplay.length > 3 && (
              <div className={dashboardStyles.viewAllContainer}>
                <button
                  onClick={() => setShowAllExpense(!showAllExpense)}
                  className={dashboardStyles.viewAllButton}
                >
                  {showAllExpense ? (
                    <>
                      <ChevronUp className="w-5 h-5" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-5 h-5" />
                      View All Expenses ({expenseListForDisplay.length})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddTransactionModal
        showModal={showModal}
        setShowModal={setShowModal}
        newTransaction={newTransaction}
        setNewTransaction={setNewTransaction}
        handleAddTransaction={handleAddTransaction}
        loading={loading}
        onPaymentInitiate={handleQRPaymentInitiate}
      />
    </div>
  );
};

export default Dashboard;

```

## frontend/src/pages/Expense.jsx

```javascript
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Plus,
  DollarSign,
  Download,
  Eye,
  Calendar,
  TrendingDown,
  Filter,
  BarChart2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import axios from "axios";
import { exportToExcel } from "../utils/exportUtils";
import FinancialCard from "../components/FinancialCard";
import TimeFrameSelector from "../components/TimeFrame";
import TransactionItem from "../components/TransactionItem";
import AddTransactionModal from "../components/Add";
import { getTimeFrameRange, generateChartPoints } from "../components/Helpers";
import { CATEGORY_ICONS } from "../assets/color";
import { expensePageStyles as styles } from "../assets/dummyStyles";
import { API_BASE } from "../config/api";

/**
 * Helper: convert date (or datetime) to ISO by attaching client current time
 * - If `dateValue` is "YYYY-MM-DD" (length 10) => attach current HH:MM:SS
 * - Otherwise attempt to parse and return ISO
 * - Fallback to now if parsing fails
 */
function toIsoWithClientTime(dateValue) {
  if (!dateValue) {
    return new Date().toISOString();
  }

  // Plain date YYYY-MM-DD
  if (typeof dateValue === "string" && dateValue.length === 10) {
    const now = new Date();
    const hhmmss = now.toTimeString().slice(0, 8); // "HH:MM:SS"
    const combined = new Date(`${dateValue}T${hhmmss}`);
    return combined.toISOString();
  }

  // Already a datetime or ISO-like string
  try {
    return new Date(dateValue).toISOString();
  } catch (err) {
    return new Date().toISOString();
  }
}

const ExpensePage = () => {
  // Get data from outlet context including refreshTransactions
  const {
    transactions: outletTransactions = [],
    timeFrame = "monthly",
    setTimeFrame = () => {},
    refreshTransactions,
  } = useOutletContext();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    description: "",
    amount: "",
    category: "Food",
    date: new Date().toISOString().split("T")[0],
  });
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    amount: "",
    type: "expense",
    category: "Food",
  });
  const [setOverview] = useState({
    totalExpense: 0,
    averageExpense: 0,
    numberOfTransactions: 0,
    recentTransactions: [],
    range: "monthly",
  });

  // Auth headers helper
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Fetch overview (GET /expense/overview?range=...)
  const fetchOverview = useCallback(
    async (range = timeFrame ?? "monthly") => {
      try {
        const res = await axios.get(`${API_BASE}/expense/overview`, {
          headers: getAuthHeaders(),
          params: { range },
        });
        const payload = res.data?.data ?? {};
        setOverview({
          totalExpense: payload.totalExpense ?? 0,
          averageExpense: payload.averageExpense ?? 0,
          numberOfTransactions: payload.numberOfTransactions ?? 0,
          recentTransactions: payload.recentTransactions ?? [],
          range: payload.range ?? range,
        });
      } catch (err) {
        console.error("Failed to fetch expense overview:", err);
      }
    },
    [timeFrame, getAuthHeaders],
  );

  // Initial load
  useEffect(() => {
    fetchOverview(timeFrame);
  }, [fetchOverview, timeFrame]);

  // Re-fetch overview when timeframe changes
  useEffect(() => {
    if (filter === "month" && !timeFrame) setTimeFrame("monthly");
    fetchOverview(timeFrame);
  }, [timeFrame, selectedMonth, filter, setTimeFrame, fetchOverview]);

  // Time frame range and chart points
  const timeFrameRange = useMemo(
    () => getTimeFrameRange(timeFrame, selectedMonth),
    [timeFrame, selectedMonth],
  );
  const chartPoints = useMemo(
    () => generateChartPoints(timeFrame, timeFrameRange),
    [timeFrame, timeFrameRange],
  );

  // Function to check if a date is within a range
  const isDateInRange = useCallback((date, start, end) => {
    const transactionDate = new Date(date);
    const startDate = new Date(start);
    const endDate = new Date(end);

    transactionDate.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return transactionDate >= startDate && transactionDate <= endDate;
  }, []);

  // Filter expense transactions from outlet transactions
  const expenseTransactions = useMemo(
    () =>
      (outletTransactions || [])
        .filter((t) => t.type === "expense")
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [outletTransactions],
  );

  // Filter transactions by time frame
  const timeFrameTransactions = useMemo(
    () =>
      expenseTransactions.filter((t) =>
        isDateInRange(t.date, timeFrameRange.start, timeFrameRange.end),
      ),
    [expenseTransactions, timeFrameRange, isDateInRange],
  );

  // Filter logic — month/year use current calendar by default
  const filteredTransactions = useMemo(() => {
    if (filter === "all") return timeFrameTransactions;

    const now = new Date();
    const yearFromSelectedMonth = selectedMonth
      ? new Date(selectedMonth).getFullYear()
      : null;
    const monthFromSelectedMonth = selectedMonth
      ? new Date(selectedMonth).getMonth()
      : null;
    const yearFromTimeFrame = timeFrameRange?.start
      ? new Date(timeFrameRange.start).getFullYear()
      : null;
    const monthFromTimeFrame = timeFrameRange?.start
      ? new Date(timeFrameRange.start).getMonth()
      : null;

    return timeFrameTransactions.filter((t) => {
      const transDate = new Date(t.date);

      if (filter === "month") {
        const compareYear =
          yearFromSelectedMonth ?? yearFromTimeFrame ?? now.getFullYear();
        const compareMonth =
          monthFromSelectedMonth ?? monthFromTimeFrame ?? now.getMonth();
        return (
          transDate.getFullYear() === compareYear &&
          transDate.getMonth() === compareMonth
        );
      }

      if (filter === "year") {
        const compareYear =
          yearFromSelectedMonth ?? yearFromTimeFrame ?? now.getFullYear();
        return transDate.getFullYear() === compareYear;
      }

      return t.category.toLowerCase() === filter.toLowerCase();
    });
  }, [timeFrameTransactions, filter, selectedMonth, timeFrameRange]);

  // Calculate totals
  const totalExpense = useMemo(
    () =>
      filteredTransactions.reduce(
        (sum, t) => sum + Math.round(Number(t.amount || 0)),
        0,
      ),
    [filteredTransactions],
  );

  const averageExpense = useMemo(
    () =>
      filteredTransactions.length
        ? Math.round(totalExpense / filteredTransactions.length)
        : 0,
    [filteredTransactions, totalExpense],
  );

  // Prepare chart data
  const chartData = useMemo(() => {
    const data = chartPoints.map((point) => ({ ...point, expense: 0 }));

    filteredTransactions.forEach((transaction) => {
      const transDate = new Date(transaction.date);
      const point = data.find((d) =>
        timeFrame === "daily"
          ? d.hour === transDate.getHours()
          : timeFrame === "yearly"
            ? d.date.getMonth() === transDate.getMonth()
            : d.date.getDate() === transDate.getDate() &&
              d.date.getMonth() === transDate.getMonth(),
      );
      point && (point.expense += Math.round(Number(transaction.amount)));
    });

    return data;
  }, [filteredTransactions, chartPoints, timeFrame]);

  // API request handler
  const handleApiRequest = async (method, url, data = null) => {
    try {
      setLoading(true);
      const config = {
        method,
        url: `${API_BASE}${url}`,
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      };

      if (data) config.data = data;

      const response = await axios(config);
      await refreshTransactions();
      await fetchOverview(timeFrame);

      return response;
    } catch (err) {
      console.error(`${method} request error:`, err);
      const serverMsg = err?.response?.data?.message;
      alert(
        serverMsg ||
          `Server error while ${method === "post" ? "adding" : method === "put" ? "updating" : "deleting"} expense.`,
      );
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Add expense -> POST /expense/add
  const handleAddTransaction = async () => {
    if (!newTransaction.description || !newTransaction.amount) return;

    try {
      // Convert date-only to ISO with client time before sending
      const payload = {
        description: newTransaction.description.trim(),
        amount: parseFloat(newTransaction.amount),
        category: newTransaction.category,
        date: toIsoWithClientTime(newTransaction.date),
      };

      await handleApiRequest("post", "/expense/add", payload);

      // If added date is outside the current visible range, switch view to that month
      const addedDate = new Date(payload.date || newTransaction.date);
      const addedDateInRange =
        addedDate >= timeFrameRange.start && addedDate <= timeFrameRange.end;

      if (!addedDateInRange) {
        setTimeFrame("monthly");
        setSelectedMonth(
          new Date(addedDate.getFullYear(), addedDate.getMonth(), 1),
        );
      }

      setNewTransaction({
        date: new Date().toISOString().split("T")[0],
        description: "",
        amount: "",
        type: "expense",
        category: "Food",
      });
      setShowModal(false);
    } catch (err) {
      // Error handled in handleApiRequest
    }
  };

  // Edit expense -> PUT /expense/update/:id
  const handleEditTransaction = async () => {
    if (!editingId || !editForm.description || !editForm.amount) return;

    try {
      const payload = {
        description: editForm.description.trim(),
        amount: parseFloat(editForm.amount),
        category: editForm.category,
        date: toIsoWithClientTime(editForm.date),
      };

      await handleApiRequest("put", `/expense/update/${editingId}`, payload);
      setEditingId(null);
    } catch (err) {
      // Error handled in handleApiRequest
    }
  };

  // Delete expense -> DELETE /expense/delete/:id
  const handleDeleteTransaction = async (id) => {
    if (!id || !window.confirm("Are you sure you want to delete this expense?"))
      return;
    await handleApiRequest("delete", `/expense/delete/${id}`);
  };

  // Export -> GET /expense/downloadexcel (server) with client fallback
  const handleExport = async () => {
    try {
      const res = await axios.get(`${API_BASE}/expense/downloadexcel`, {
        headers: getAuthHeaders(),
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });
      const disposition = res.headers["content-disposition"];
      let filename = "expense_details.xlsx";

      if (disposition) {
        const match = disposition.match(/filename="?(.+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Export error:", err);
      // Fallback client export
      try {
        const exportData = filteredTransactions.map((t) => ({
          Date: new Date(t.date).toLocaleDateString(),
          Description: t.description,
          Category: t.category,
          Amount: t.amount,
          Type: "Expense",
        }));
        exportToExcel(
          exportData,
          `expenses_${new Date().toISOString().slice(0, 10)}`,
        );
      } catch (e) {
        console.error("Fallback export failed:", e);
        alert("Failed to export data.");
      }
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerCard}>
        <div className={styles.headerContainer}>
          <div>
            <h1 className={styles.headerTitle}>Expense Overview</h1>
            <p className={styles.headerSubtitle}>
              Track and manage your expenses
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className={styles.addButton}
            disabled={loading}
          >
            <Plus size={20} /> {loading ? "Processing..." : "Add Expense"}
          </button>
        </div>

        <div className={styles.timeframePositioning}>
          <TimeFrameSelector
            timeFrame={timeFrame}
            setTimeFrame={(frame) => {
              setTimeFrame(frame);
              setSelectedMonth(null);
            }}
            options={["daily", "weekly", "monthly", "yearly"]}
            color="orange"
          />
        </div>
      </div>

      <div className={styles.cardsGrid}>
        <FinancialCard
          icon={
            <div className={styles.iconOrange}>
              <DollarSign className={`w-5 h-5 ${styles.textOrange}`} />
            </div>
          }
          label="Total Expenses"
          value={`₹${totalExpense.toLocaleString()}`}
          additionalContent={
            <div className="mt-2 text-xs text-gray-500 flex items-center">
              <Calendar className="w-3 h-3 mr-1" /> {timeFrameRange.label}
            </div>
          }
          borderColor={styles.borderOrange}
        />

        <FinancialCard
          icon={
            <div className={styles.iconAmber}>
              <BarChart2 className={`w-5 h-5 ${styles.textAmber}`} />
            </div>
          }
          label="Average Expense"
          value={`₹${averageExpense.toLocaleString()}`}
          additionalContent={
            <div className="mt-2 text-xs text-gray-500 flex items-center">
              <Calendar className="w-3 h-3 mr-1" />{" "}
              {filteredTransactions.length} transactions
            </div>
          }
          borderColor={styles.borderAmber}
        />

        <FinancialCard
          icon={
            <div className={styles.iconYellow}>
              <TrendingDown className={`w-5 h-5 ${styles.textYellow}`} />
            </div>
          }
          label="Transactions"
          value={filteredTransactions.length}
          additionalContent={
            <div className="mt-2 text-xs text-gray-500 flex items-center">
              <Calendar className="w-3 h-3 mr-1" />{" "}
              {filter === "all" ? "All records" : "Filtered records"}
            </div>
          }
          borderColor={styles.borderYellow}
        />
      </div>

      <div className={styles.chartContainer}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>
            <BarChart2 className="w-6 h-6 text-orange-500" />
            {timeFrame === "daily"
              ? "Hourly"
              : timeFrame === "yearly"
                ? "Monthly"
                : "Daily"}{" "}
            Expense Trends
            <span className="text-sm text-gray-500 font-normal">
              {" "}
              ({timeFrameRange.label})
            </span>
          </h3>

          <button onClick={handleExport} className={styles.chartExportButton}>
            <Download size={18} /> Export Data
          </button>
        </div>

        <div className={styles.chartHeight}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <defs>
                <linearGradient
                  id="expenseGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#ff9800" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ff9800" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f3f4f6"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 12 }}
                width={60}
                tickFormatter={(value) => `₹${value.toLocaleString()}`}
              />
              <Tooltip
                formatter={(value) => [
                  `₹${Math.round(value).toLocaleString()}`,
                  "Expense",
                ]}
                contentStyle={styles.tooltipContent}
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="#ff9800"
                fill="url(#expenseGradient)"
                strokeWidth={2}
                activeDot={{ r: 6, fill: "#ff9800" }}
              />
              {chartData.map(
                (point, index) =>
                  point.isCurrent && (
                    <ReferenceLine
                      key={index}
                      x={point.label}
                      stroke="#ff5722"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                    />
                  ),
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.transactionsContainer}>
        <div className={styles.transactionsHeader}>
          <h3 className={styles.transactionsTitle}>
            <DollarSign className="w-6 h-6 -mx-1.5 lg:-mx-2 md:-mx-0 text-orange-500" />
            Expense Transactions
            <span className="text-sm text-gray-500 font-normal">
              {" "}
              ({timeFrameRange.label})
            </span>
          </h3>

          <div className="flex flex-col sm:flex-row gap-2 md:gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="all">All Transactions</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="Food">Food</option>
                <option value="Housing">Housing</option>
                <option value="Transport">Transport</option>
                <option value="Shopping">Shopping</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Utilities">Utilities</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <button onClick={handleExport} className={styles.exportButton}>
              <Download size={18} /> Export
            </button>
          </div>
        </div>

        <div className={styles.transactionsList}>
          {filteredTransactions
            .slice(0, showAll ? filteredTransactions.length : 8)
            .map((transaction) => (
              <TransactionItem
                key={transaction.id}
                transaction={transaction}
                isEditing={editingId === transaction.id}
                editForm={editForm}
                setEditForm={setEditForm}
                onSave={handleEditTransaction}
                onCancel={() => setEditingId(null)}
                onDelete={handleDeleteTransaction}
                type="expense"
                categoryIcons={CATEGORY_ICONS}
                setEditingId={setEditingId}
                containerClass={styles.transactionItemContainer}
                amountClass={styles.transactionAmount}
                iconClass={styles.transactionIcon}
              />
            ))}

          {!showAll && filteredTransactions.length > 8 && (
            <button
              onClick={() => setShowAll(true)}
              className={styles.viewAllButton}
            >
              <Eye size={18} /> View All {filteredTransactions.length}{" "}
              Transactions
            </button>
          )}

          {filteredTransactions.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <DollarSign className="w-8 h-8 text-orange-400" />
              </div>
              <p className={styles.emptyStateText}>
                No expense transactions found
              </p>
              <p className={styles.emptyStateSubtext}>
                {filter === "all"
                  ? "You haven't recorded any expenses yet"
                  : `No ${filter} transactions found`}
              </p>
              <button
                onClick={() => setShowModal(true)}
                className={styles.addButton}
              >
                <Plus size={20} /> Add Expense
              </button>
            </div>
          )}
        </div>
      </div>

      <AddTransactionModal
        showModal={showModal}
        setShowModal={setShowModal}
        newTransaction={newTransaction}
        setNewTransaction={setNewTransaction}
        handleAddTransaction={handleAddTransaction}
        loading={loading}
        type="expense"
        title="Add New Expense"
        buttonText="Add Expense"
        categories={[
          "Food",
          "Housing",
          "Transport",
          "Shopping",
          "Entertainment",
          "Utilities",
          "Healthcare",
          "Other",
        ]}
        color="orange"
      />
    </div>
  );
};

export default ExpensePage;

//this is similar to the income page
// similar functions just in place of income replace it with expense

```

## frontend/src/pages/Income.jsx

```javascript
import { useState, useMemo, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Plus,
  DollarSign,
  Download,
  Eye,
  Calendar,
  TrendingUp,
  Filter,
  BarChart2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import axios from "axios";
import { exportToExcel } from "../utils/exportUtils";
import AddTransactionModal from "../components/Add";
import TransactionItem from "../components/TransactionItem";
import TimeFrameSelector from "../components/TimeFrame";
import FinancialCard from "../components/FinancialCard";
import { getTimeFrameRange, generateChartPoints } from "../components/Helpers";
import { INCOME_COLORS, CATEGORY_ICONS_Inc } from "../assets/color";
import { incomeStyles as styles } from "../assets/dummyStyles";
import { API_BASE } from "../config/api";

//helps in converting date to ISO time
function toIsoWithClientTime(dateValue) {
  if (!dateValue) {
    return new Date().toISOString();
  }

  if (typeof dateValue === "string" && dateValue.length === 10) {
    const now = new Date();
    const hhmmss = now.toTimeString().slice(0, 8);
    const combined = new Date(`${dateValue}T${hhmmss}`);
    return combined.toISOString();
  }

  try {
    return new Date(dateValue).toISOString();
  } catch (err) {
    return new Date().toISOString();
  }
}

//small component
const IncomeChart = ({ chartData, timeFrame, timeFrameRange }) => (
  <div className={styles.chartContainer}>
    <div className={styles.chartHeaderContainer}>
      <h3 className={styles.chartTitle}>
        <BarChart2 className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
        {timeFrame === "daily"
          ? "Hourly"
          : timeFrame === "yearly"
            ? "Monthly"
            : "Daily"}{" "}
        Income Trends
        <span className="text-sm text-gray-500 font-normal">
          {" "}
          ({timeFrameRange.label})
        </span>
      </h3>
    </div>

    <div className={styles.chartHeight}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
        >
          <defs>
            <linearGradient id="incomeBarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#f3f4f6"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b7280", fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b7280", fontSize: 12 }}
            width={50}
            tickFormatter={(value) => `₹${value.toLocaleString()}`}
          />
          <Tooltip
            formatter={(value) => [
              `₹${Math.round(value).toLocaleString()}`,
              "Income",
            ]}
            contentStyle={styles.tooltipContent}
          />
          <Bar
            dataKey="income"
            name="Income"
            radius={[6, 6, 0, 0]}
            barSize={20}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={INCOME_COLORS[index % INCOME_COLORS.length]}
              />
            ))}
          </Bar>

          {chartData.map(
            (point, index) =>
              point.isCurrent && (
                <ReferenceLine
                  key={index}
                  x={point.label}
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                />
              ),
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
); //for income chart

//small component
const FilterSection = ({ filter, setFilter, handleExport }) => (
  <div className={styles.filterContainer}>
    <div className="relative w-full sm:w-auto">
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className={styles.filterSelect}
      >
        <option value="all">All Transactions</option>
        <option value="month">This Month</option>
        <option value="year">This Year</option>
        <option value="Salary">Salary</option>
        <option value="Freelance">Freelance</option>
        <option value="Investment">Investment</option>
        <option value="Bonus">Bonus</option>
        <option value="Other">Other</option>
      </select>
      <Filter className={styles.filterIcon} />
    </div>

    <button onClick={handleExport} className={styles.exportButton}>
      <Download size={16} className="md:size-4" /> Export
    </button>
  </div>
); //added for filtering the data

const Income = () => {
  const {
    transactions: outletTransactions = [],
    timeFrame = "monthly",
    setTimeFrame = () => {},
    refreshTransactions,
  } = useOutletContext();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState({
    totalIncome: 0,
    averageIncome: 0,
    numberOfTransactions: 0,
    recentTransactions: [],
    range: "monthly",
  });
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    amount: "",
    type: "income",
    category: "Salary",
  });
  const [editForm, setEditForm] = useState({
    description: "",
    amount: "",
    category: "Salary",
    date: new Date().toISOString().split("T")[0],
  });

  //to get the token from localstorage
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const timeFrameRange = useMemo(
    () => getTimeFrameRange(timeFrame, null),
    [timeFrame],
  );
  const chartPoints = useMemo(
    () => generateChartPoints(timeFrame, timeFrameRange),
    [timeFrame, timeFrameRange],
  );

  //function to check if a date is within a range or not
  const isDateInRange = useCallback((date, start, end) => {
    const transactionDate = new Date(date);
    const startDate = new Date(start);
    const endDate = new Date(end);

    transactionDate.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return transactionDate >= startDate && transactionDate <= endDate;
  }, []);

  const incomeTransactions = useMemo(
    () =>
      (outletTransactions || [])
        .filter((t) => t.type === "income")
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [outletTransactions],
  ); //filter transactions coming from outletcontext

  const timeFrameTransactions = useMemo(
    () =>
      incomeTransactions.filter((t) =>
        isDateInRange(t.date, timeFrameRange.start, timeFrameRange.end),
      ),
    [incomeTransactions, timeFrameRange, isDateInRange],
  );//filter by time frame

  const filteredTransactions = useMemo(() => {
    if (filter === "all") return timeFrameTransactions;

    return timeFrameTransactions.filter((t) => {
      if (filter === "month" || filter === "year") {
        const transDate = new Date(t.date);
        if (filter === "month") {
          return (
            transDate.getMonth() === timeFrameRange.start.getMonth() &&
            transDate.getFullYear() === timeFrameRange.start.getFullYear()
          );
        }
        if (filter === "year") {
          return transDate.getFullYear() === timeFrameRange.start.getFullYear();
        }
      }
      return t.category.toLowerCase() === filter.toLowerCase();
    });
  }, [timeFrameTransactions, filter, timeFrameRange]);

  //additional filters
  const chartData = useMemo(() => {
    const data = chartPoints.map((point) => ({ ...point, income: 0 }));

    filteredTransactions.forEach((transaction) => {
      const transDate = new Date(transaction.date);
      const point = data.find((d) =>
        timeFrame === "daily"
          ? d.hour === transDate.getHours()
          : timeFrame === "yearly"
            ? d.date.getMonth() === transDate.getMonth()
            : d.date.getDate() === transDate.getDate() &&
              d.date.getMonth() === transDate.getMonth(),
      );
      point && (point.income += Math.round(Number(transaction.amount)));
    });

    return data;
  }, [filteredTransactions, chartPoints, timeFrame]);

  //fetch the overview from the server side
  const fetchOverview = useCallback(
    async (range = timeFrame ?? "monthly") => {
      try {
        const res = await axios.get(`${API_BASE}/income/overview`, {
          headers: getAuthHeaders(),
          params: { range },
        });

        if (res.data?.success) {
          const payload = res.data.data ?? {};
          setOverview({
            totalIncome: payload.totalIncome ?? 0,
            averageIncome: payload.averageIncome ?? 0,
            numberOfTransactions: payload.numberOfTransactions ?? 0,
            recentTransactions: payload.recentTransactions ?? [],
            range: payload.range ?? range,
          });
        }
      } catch (err) {
        console.error("Failed to fetch overview:", err);
      }
    },
    [timeFrame, getAuthHeaders],
  );

  useEffect(() => {
    fetchOverview(timeFrame ?? "monthly");
  }, [fetchOverview, timeFrame]);

  const totalIncome = useMemo(
    () =>
      overview.totalIncome ??
      filteredTransactions.reduce(
        (sum, t) => sum + Math.round(Number(t.amount || 0)),
        0,
      ),
    [overview.totalIncome, filteredTransactions],
  );

  const averageIncome = useMemo(
    () =>
      overview.averageIncome
        ? Math.round(overview.averageIncome)
        : filteredTransactions.length
          ? Math.round(
              filteredTransactions.reduce(
                (s, t) => s + Math.round(Number(t.amount || 0)),
                0,
              ) / filteredTransactions.length,
            )
          : 0,
    [overview.averageIncome, filteredTransactions],
  ); //use backend overview if available

  const transactionsCount = useMemo(
    () => overview.numberOfTransactions ?? filteredTransactions.length,
    [overview.numberOfTransactions, filteredTransactions],
  );

  //to add an income
  const handleAddTransaction = useCallback(async () => {
    if (!newTransaction.description || !newTransaction.amount) return;

    try {
      setLoading(true);

      const payload = {
        description: newTransaction.description.trim(),
        amount: parseFloat(newTransaction.amount),
        category: newTransaction.category,
        date: toIsoWithClientTime(newTransaction.date),
      };

      await axios.post(`${API_BASE}/income/add`, payload, {
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      await refreshTransactions();
      await fetchOverview(timeFrame ?? "monthly");

      setNewTransaction({
        date: new Date().toISOString().split("T")[0],
        description: "",
        amount: "",
        type: "income",
        category: "Salary",
      });
      setShowModal(false);
    } catch (err) {
      console.error("Add income error:", err);
      const serverMsg = err?.response?.data?.message;
      alert(serverMsg || "Server error while adding income.");
    } finally {
      setLoading(false);
    }
  }, [
    newTransaction,
    getAuthHeaders,
    refreshTransactions,
    fetchOverview,
    timeFrame,
  ]);

  //to update an income
  const handleEditTransaction = useCallback(async () => {
    if (!editingId || !editForm.description || !editForm.amount) return;

    try {
      setLoading(true);

      const payload = {
        description: editForm.description.trim(),
        amount: parseFloat(editForm.amount),
        category: editForm.category,
        date: toIsoWithClientTime(editForm.date),
      };

      await axios.put(`${API_BASE}/income/update/${editingId}`, payload, {
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });

      await refreshTransactions();
      await fetchOverview(timeFrame ?? "monthly");

      setEditingId(null);
    } catch (err) {
      console.error("Update income error:", err);
      const serverMsg = err?.response?.data?.message;
      alert(serverMsg || "Server error while updating income.");
    } finally {
      setLoading(false);
    }
  }, [
    editingId,
    editForm,
    getAuthHeaders,
    refreshTransactions,
    fetchOverview,
    timeFrame,
  ]);

  //to delete an income transaction
  const handleDeleteTransaction = useCallback(
    async (id) => {
      if (!id) return;
      if (!window.confirm("Are you sure you want to delete this income?"))
        return;

      try {
        setLoading(true);
        await axios.delete(`${API_BASE}/income/delete/${id}`, {
          headers: getAuthHeaders(),
        });

        await refreshTransactions();
        await fetchOverview(timeFrame ?? "monthly");
      } catch (err) {
        console.error("Delete income error:", err);
        const serverMsg = err?.response?.data?.message;
        alert(serverMsg || "Server error while deleting income.");
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders, refreshTransactions, fetchOverview, timeFrame],
  );

  //to download the excel sheet
  const handleExport = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/income/downloadexcel`, {
        headers: getAuthHeaders(),
        responseType: "blob",
      });

      const blob = new Blob([res.data], {
        type: res.headers["content-type"] || "application/octet-stream",
      });
      const disposition = res.headers["content-disposition"];
      let filename = "income_details.xlsx";
      if (disposition) {
        const match = disposition.match(/filename="?(.+)"?/);
        if (match && match[1]) filename = match[1];
      }
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Export error:", err);
      try {
        const exportData = filteredTransactions.map((t) => ({
          Date: new Date(t.date).toLocaleDateString(),
          Description: t.description,
          Category: t.category,
          Amount: t.amount,
          Type: "Income",
        }));
        exportToExcel(
          exportData,
          `income_${new Date().toISOString().slice(0, 10)}`,
        );
      } catch (e) {
        console.error("Fallback export failed:", e);
        alert("Failed to export data.");
      }
    }
  }, [getAuthHeaders, filteredTransactions]);

  //rest is the UI part
  return (
    <div className={styles.wrapper}>
      <div className={styles.headerContainer}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Income Overview</h1>
            <p className={styles.headerSubtitle}>
              Track and manage your income sources
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className={styles.addButton}
            disabled={loading}
          >
            <Plus size={18} className="md:size-5" />{" "}
            {loading ? "Processing..." : "Add Income"}
          </button>
        </div>

        <div className={styles.timeFrameContainer}>
          <TimeFrameSelector
            timeFrame={timeFrame}
            setTimeFrame={setTimeFrame}
            options={["daily", "weekly", "monthly", "yearly"]}
            color="teal"
          />
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <FinancialCard
          icon={
            <div className={styles.iconGreen}>
              <DollarSign
                className={`w-4 h-4 md:w-5 md:h-5 ${styles.textGreen}`}
              />
            </div>
          }
          label="Total Income"
          value={`₹${Number(totalIncome || 0).toLocaleString()}`}
          additionalContent={
            <div className="mt-2 text-xs text-gray-500 flex items-center">
              <Calendar className="w-3 h-3 mr-1" /> {timeFrameRange.label}
            </div>
          }
        />

        <FinancialCard
          icon={
            <div className={styles.iconBlue}>
              <BarChart2
                className={`w-4 h-4 md:w-5 md:h-5 ${styles.textBlue}`}
              />
            </div>
          }
          label="Average Income"
          value={`₹${Number(averageIncome || 0).toLocaleString()}`}
          additionalContent={
            <div className="mt-2 text-xs text-gray-500 flex items-center">
              <Calendar className="w-3 h-3 mr-1" /> {transactionsCount}{" "}
              transactions
            </div>
          }
        />

        <FinancialCard
          icon={
            <div className={styles.iconPurple}>
              <TrendingUp
                className={`w-4 h-4 md:w-5 md:h-5 ${styles.textPurple}`}
              />
            </div>
          }
          label="Transactions"
          value={transactionsCount}
          additionalContent={
            <div className="mt-2 text-xs text-gray-500 flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              {filter === "all" ? "All records" : "Filtered records"}
            </div>
          }
        />
      </div>

      <IncomeChart
        chartData={chartData}
        timeFrame={timeFrame}
        timeFrameRange={timeFrameRange}
      />

      <div className={styles.listContainer}>
        <div className={styles.header}>
          <h3 className={styles.sectionTitle}>
            <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-green-500" />
            Income Transactions
            <span className="text-sm text-gray-500 font-normal">
              {" "}
              ({timeFrameRange.label})
            </span>
          </h3>

          <FilterSection
            filter={filter}
            setFilter={setFilter}
            handleExport={handleExport}
          />
        </div>

        <div className={styles.transactionList}>
          {filteredTransactions
            .slice(0, showAll ? filteredTransactions.length : 8)
            .map((transaction) => (
              <TransactionItem
                key={transaction.id}
                transaction={transaction}
                isEditing={editingId === transaction.id}
                editForm={editForm}
                setEditForm={setEditForm}
                onSave={handleEditTransaction}
                onCancel={() => setEditingId(null)}
                onDelete={handleDeleteTransaction}
                type="income"
                categoryIcons={CATEGORY_ICONS_Inc}
                setEditingId={setEditingId}
              />
            ))}

          {!showAll && filteredTransactions.length > 8 && (
            <button
              onClick={() => setShowAll(true)}
              className={styles.viewAllButton}
            >
              <Eye size={18} /> View All {filteredTransactions.length}{" "}
              Transactions
            </button>
          )}

          {filteredTransactions.length === 0 && (
            <div className={styles.emptyStateContainer}>
              <div className={styles.emptyStateIcon}>
                <DollarSign className="w-6 h-6 md:w-8 md:h-8 text-green-400" />
              </div>
              <p className={styles.emptyStateText}>
                No income transactions found
              </p>
              <p className={styles.emptyStateSubtext}>
                {filter === "all"
                  ? "You haven't recorded any income yet"
                  : `No ${filter} transactions found`}
              </p>
              <button
                onClick={() => setShowModal(true)}
                className={styles.emptyStateButton}
              >
                <Plus size={16} className="md:size-5" /> Add Income
              </button>
            </div>
          )}
        </div>
      </div>

      <AddTransactionModal
        showModal={showModal}
        setShowModal={setShowModal}
        newTransaction={newTransaction}
        setNewTransaction={setNewTransaction}
        handleAddTransaction={handleAddTransaction}
        loading={loading}
        type="income"
        title="Add New Income"
        buttonText="Add Income"
        categories={["Salary", "Freelance", "Investment", "Bonus", "Other"]}
        color="teal"
      />
    </div>
  );
};

export default Income;

```

## frontend/src/pages/Payment.jsx

```javascript
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Send } from "lucide-react";
import { modalStyles } from "../assets/dummyStyles"; // Using existing styles if needed, or custom tailwind

const Payment = ({ addTransaction }) => {
  const navigate = useNavigate();
  const [paymentDetails, setPaymentDetails] = useState({
    payee: "",
    upiId: "",
    amount: "",
    note: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = (e) => {
    e.preventDefault();
    setIsProcessing(true);
    
    // Simulate payment processing
    setTimeout(() => {
      // Add transaction
      if (addTransaction && paymentDetails.amount) {
        addTransaction({
          id: Date.now().toString(),
          description: `Payment to ${paymentDetails.payee || paymentDetails.upiId} ${paymentDetails.note ? `(${paymentDetails.note})` : ''}`,
          amount: parseFloat(paymentDetails.amount),
          category: "Other",
          type: "expense",
          date: new Date().toISOString().split("T")[0],
        });
      }
      
      setIsProcessing(false);
      navigate("/");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 flex items-center gap-4">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition"
        >
          <ArrowLeft size={24} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-semibold text-gray-800">Make a Payment</h1>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 flex justify-center items-start">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-teal-500 p-6 text-white">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/20 p-4 rounded-full">
                <CreditCard size={48} />
              </div>
            </div>
            <h2 className="text-center text-2xl font-bold">Secure Payment</h2>
            <p className="text-center text-blue-100 mt-1">Enter payment details to proceed</p>
          </div>

          <form onSubmit={handlePayment} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payee Name</label>
              <input
                type="text"
                required
                placeholder="John Doe"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                value={paymentDetails.payee}
                onChange={(e) => setPaymentDetails({...paymentDetails, payee: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID / Account Info</label>
              <input
                type="text"
                required
                placeholder="john@upi"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                value={paymentDetails.upiId}
                onChange={(e) => setPaymentDetails({...paymentDetails, upiId: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-lg font-semibold"
                value={paymentDetails.amount}
                onChange={(e) => setPaymentDetails({...paymentDetails, amount: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
              <input
                type="text"
                placeholder="What is this for?"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                value={paymentDetails.note}
                onChange={(e) => setPaymentDetails({...paymentDetails, note: e.target.value})}
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-lg transition ${
                isProcessing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Pay Now
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Payment;

```

## frontend/src/pages/Profile.jsx

```javascript
import React, { memo, useCallback, useEffect, useState } from "react";
import { profileStyles } from "../assets/dummyStyles";
import Modal from "react-modal";
import { Eye, EyeOff, Lock, User, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import { API_BASE as BASE_URL } from "../config/api";

Modal.setAppElement("#root");
// Move PasswordInput component outside of ProfilePage to prevent recreation on every render
const PasswordInput = memo(
  ({ name, label, value, error, showField, onToggle, onChange, disabled }) => (
    <div>
      <label className={profileStyles.passwordLabel}>{label}</label>
      <div className={profileStyles.passwordContainer}>
        <input
          type={showField ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          className={`${profileStyles.inputWithError} ${
            error ? "border-red-300" : "border-gray-200"
          }`}
          placeholder={`Enter ${label.toLowerCase()}`}
          disabled={disabled}
          // Add key prop to help React identify the input
          key={`password-input-${name}`}
        />
        <button
          type="button"
          onClick={onToggle}
          className={profileStyles.passwordToggle}
          disabled={disabled}
        >
          {showField ? (
            <EyeOff className="w-5 h-5" />
          ) : (
            <Eye className="w-5 h-5" />
          )}
        </button>
      </div>
      {error && <p className={profileStyles.errorText}>{error}</p>}
    </div>
  ),
);

PasswordInput.displayName = "PasswordInput";

const Profile = ({onUpdateProfile, onLogout }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState({
    name: "",
    email: "",
    joinDate: "",
  });
  const [editMode, setEditMode] = useState(false);
  const [tempUser, setTempUser] = useState({ ...user });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current: "",
    new: "",
    confirm: "", //same as new password
  });
  const [showPassword, setShowPassword] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const getAuthToken = useCallback(() => localStorage.getItem("token"), []);

  // API request
  const handleApiRequest = useCallback(
    async (method, endpoint, data = null) => {
      const token = getAuthToken();
      if (!token) {
        navigate("/login");
        return null;
      }

      try {
        setLoading(true);
        const config = {
          method,
          url: `${BASE_URL}${endpoint}`,
          headers: { Authorization: `Bearer ${token}` },
        };
        if (data) config.data = data;
        const response = await axios(config);
        return response.data;
      } catch (error) {
        console.error(`${method} request error:`, error);
        if (error.response?.status === 401) {
          navigate("/login");
        }
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [getAuthToken, navigate],
  );

  // to fetch current user
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const data = await handleApiRequest("get", "/user/me");
        if (data) {
          const userData = data.user || data;
          setUser(userData);
          setTempUser(userData);
        }
      } catch (err) {
        toast.error("Failed to load user data");
      }
    };
    fetchUserData();
  }, [handleApiRequest]);

  // Input change handlers
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setTempUser((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handlePasswordChange = useCallback((e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    setPasswordErrors((prev) => ({ ...prev, [name]: "" }));
  }, []);

  // Password visibility toggle
  const togglePasswordVisibility = useCallback((field) => {
    setShowPassword((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);

  // save profile
// save profile
  const handleSaveProfile = async () => {
    try {
      const data = await handleApiRequest("put", "/user/profile", tempUser);
      if (data) {
        const updatedUser = data.user || data;
        setUser(updatedUser);
        setTempUser(updatedUser);
        setEditMode(false);
        onUpdateProfile?.(updatedUser);
        toast.success("Profile updated successfully!");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update profile");
    }
  };

  const handleCancelEdit = useCallback(() => {
    setTempUser(user);
    setEditMode(false);
  }, [user]);

  // Password validation
  const validatePassword = useCallback(() => {
    const errors = {};
    if (!passwordData.current) errors.current = "Current password is required";
    if (!passwordData.new) {
      errors.new = "New password is required";
    } else if (passwordData.new.length < 8) {
      errors.new = "Password must be at least 8 characters";
    }
    if (passwordData.new !== passwordData.confirm) {
      errors.confirm = "Passwords do not match";
    }
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  }, [passwordData]);

  // to change password
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!validatePassword()) return;

    try {
      await handleApiRequest("put", "/user/password", {
        currentPassword: passwordData.current,
        newPassword: passwordData.new,
      });

      toast.success("Password changed successfully!");
      setShowPasswordModal(false);
      setPasswordData({ current: "", new: "", confirm: "" });
      setPasswordErrors({});

      // reset password visiblility
      setShowPassword({ current: false, new: false, confirm: false });
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to change password");
    }
  };

  const handleLogout = useCallback(() => {
    onLogout?.();
    navigate("/signup");
  }, [onLogout, navigate]);

  const closePasswordModal = useCallback(() => {
    if (!loading) {
      setShowPasswordModal(false);
      setPasswordData({ current: "", new: "", confirm: "" });
      setPasswordErrors({});

      // reset password visiblility
      setShowPassword({ current: false, new: false, confirm: false });
    }
  }, [loading]);

  return (
    <div className={profileStyles.container}>
      <ToastContainer
        position="top-right"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />

      <div className={profileStyles.mainContainer}>
        <div className={profileStyles.header}>
          <div className={profileStyles.avatar}>
            <User className=" w-12 h-12 text-white" />
          </div>
          <h1 className={profileStyles.userName}>
            {user.name || "Loading..."}
          </h1>
          <p className={profileStyles.userEmail}>
            {user.email || "Loading..."}
          </p>
        </div>

        <div className={profileStyles.content}>
          <div className={profileStyles.grid}>
            <div className={profileStyles.card}>
              <div className=" flex justify-between items-center mb-6">
                <h2 className={profileStyles.cardTitle}>
                  <User className={profileStyles.icon} />
                  Personal Information
                </h2>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className={profileStyles.editButton}
                    disabled={loading}
                  >
                    {loading ? "Loading..." : "Edit"}
                  </button>
                )}
              </div>

              {editMode ? (
                <div className=" space-y-4">
                  <div>
                    <label className={profileStyles.label}>Full Name</label>
                    <input
                      type="text"
                      name="name"
                      value={tempUser.name}
                      onChange={handleInputChange}
                      className={profileStyles.input}
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className={profileStyles.label}>Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={tempUser.email}
                      onChange={handleInputChange}
                      className={profileStyles.input}
                      disabled={loading}
                    />
                  </div>

                  <div className=" flex gap-3 pt-4">
                    <button
                      onClick={handleSaveProfile}
                      className={profileStyles.buttonPrimary}
                      disabled={loading}
                    >
                      {loading ? "Saving..." : "Save Changes"}
                    </button>

                    <button
                      onClick={handleCancelEdit}
                      className={profileStyles.buttonSecondary}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className={profileStyles.label}>Full Name</p>
                    <p className=" font-medium text-gray-800">{user.name}</p>
                  </div>

                  <div>
                    <p className={profileStyles.label}>Email Address</p>
                    <p className=" font-medium text-gray-800">{user.email}</p>
                  </div>
                </div>
              )}
            </div>

            <div className={profileStyles.card}>
              <h2 className={profileStyles.cardTitle}>
                <Lock className={profileStyles.icon} />
                Account Security
              </h2>

              <div className=" space-y-4">
                <div className={profileStyles.securityItem}>
                  <div>
                    <p className={profileStyles.securityText}>Password</p>
                  </div>
                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className={profileStyles.changeButton}
                    disabled={loading}
                  >
                    Change
                  </button>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className={`${profileStyles.buttonPrimary}
               mt-6 w-full hover:opacity-90 transition-opacity`}
                disabled={loading}
              >
                {loading ? "Processing..." : "Logout"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onRequestClose={closePasswordModal}
        contentLabel="Change Password"
        className="modal"
        overlayClassName="modal-overlay"
        // Prevent unnecessary re-renders
        shouldCloseOnOverlayClick={!loading}
        shouldCloseOnEsc={!loading}
      >
        <div className={profileStyles.modalContent}>
          <div className={profileStyles.modalHeader}>
            <h3 className={profileStyles.modalTitle}>Change Password</h3>
            <button
              onClick={closePasswordModal}
              className="text-gray-500 hover:text-gray-800 disabled:opacity-50"
              disabled={loading}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 lg:-mx-20">
            <PasswordInput
              name="current"
              label="Current Password"
              value={passwordData.current}
              error={passwordErrors.current}
              showField={showPassword.current}
              onToggle={() => togglePasswordVisibility("current")}
              onChange={handlePasswordChange}
              disabled={loading}
            />

            <PasswordInput
              name="new"
              label="New Password"
              value={passwordData.new}
              error={passwordErrors.new}
              showField={showPassword.new}
              onToggle={() => togglePasswordVisibility("new")}
              onChange={handlePasswordChange}
              disabled={loading}
            />

            <PasswordInput
              name="confirm"
              label="Confirm New Password"
              value={passwordData.confirm}
              error={passwordErrors.confirm}
              showField={showPassword.confirm}
              onToggle={() => togglePasswordVisibility("confirm")}
              onChange={handlePasswordChange}
              disabled={loading}
            />

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className={profileStyles.buttonPrimary}
                disabled={loading}
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
              <button
                type="button"
                onClick={closePasswordModal}
                className={profileStyles.buttonSecondary}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
};

export default Profile;

```

## frontend/src/utils/exportUtils.js

```javascript
import * as XLSX from 'xlsx';

export const exportToExcel = (data, fileName = "transactions") => {
    if (!data || data.length === 0) {
        alert("No data to export!");
        return;
    }

    try {
        const worksheet = XLSX.utils.json_to_sheet(data);
        // create a workbook
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");

        // Generate a Excel file and trigger download
        XLSX.writeFile(workbook, `${fileName}.xlsx`, {
            bookType: 'xlsx',
            type: 'array'
        });
    }

    catch (error) {
        console.error("Export error:", error);
        alert("Error exporting data. Please try again.")
    }
}
```

## frontend/vite.config.js

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),],
})

```

