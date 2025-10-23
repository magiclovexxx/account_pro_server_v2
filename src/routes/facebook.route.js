import express from 'express';
const router = express.Router();
import { appwrite } from '../services/appwrite'

router.post('/add-account', async (req, res) => {
    try {
        const { graphId, accountId, email, password, twoFactorCode } = req.body;
        const { uid } = req;
        const facebookAccount = await appwrite('accounts', accountId);

        if (!facebookAccount) {
            return res.status(404).json({
                status: "error",
                message: "Tài khoản facebook này không tồn tại!"
            });
        }

        const postServerList = await appwrite('accounts', accountId);

        const facebookAccountPostServer = postServerList.find(
            (server) => server.uid === facebookAccount.postServer
        );

        if (!facebookAccountPostServer) {
            return res.status(404).json({
                status: "error",
                message: "Không tìm thấy máy chủ, hãy đợi 1 phút và thử lại sau!"
            });
        }

        const facebook_id = facebookAccount._id
        const loginFacebookOnServerPostRequest = await loginFacebookOnServerPost(
            facebookAccountPostServer,
            graphId,
            account,
            password,
            twoFactorCode,
            facebook_id,
        );

        if (loginFacebookOnServerPostRequest.data) {
            if (loginFacebookOnServerPostRequest.data.status === "success") {
                if (
                    facebookAccount.userInfo.graphId === loginFacebookOnServerPostRequest.data.result.graphId
                ) {
                    const newFacebookInfoToUpdate = {
                        isLoggedIn: true,
                        "userInfo.id": loginFacebookOnServerPostRequest.data.result.id,
                        "userInfo.profileUrl": `https://www.facebook.com/${loginFacebookOnServerPostRequest.data.result.id}`
                    };

                    if (
                        loginFacebookOnServerPostRequest && loginFacebookOnServerPostRequest.data && loginFacebookOnServerPostRequest.data.result
                        // loginFacebookOnServerPostRequest.data.result.authKey
                    ) {
                        newFacebookInfoToUpdate.encryptedAccount = encryptSecret(account);
                        newFacebookInfoToUpdate.encryptedPassword = encryptSecret(password);
                        // newFacebookInfoToUpdate.authKey =
                        //   loginFacebookOnServerPostRequest.data.result.authKey;
                        newFacebookInfoToUpdate.autoReLoginStatus = "enabled";
                        newFacebookInfoToUpdate.profileAccessToken = loginFacebookOnServerPostRequest.data.result.access_token
                        newFacebookInfoToUpdate.facebook_uid = loginFacebookOnServerPostRequest.data.result.facebook_uid

                    }

                    console.log("Data connect Account", loginFacebookOnServerPostRequest.data.result)
                    await Facebook.updateOne(
                        {
                            "userInfo.graphId": graphId,
                            _account: uid,
                        },
                        newFacebookInfoToUpdate
                    );
                    return res.status(200).json({
                        status: "success",
                        message: "Kết nối thành công!"
                    });
                }
                return res.status(400).json({
                    status: "error",
                    message: "Vui lòng kết nối đúng tài khoản!"
                });
            }
            if (loginFacebookOnServerPostRequest.data.status === "checkpoint") {
                if (
                    loginFacebookOnServerPostRequest.data.result && loginFacebookOnServerPostRequest.data.result.wsEndpoint
                ) {
                    return res.status(200).json({
                        status: "checkpoint",
                        result: {
                            wsEndpoint:
                                loginFacebookOnServerPostRequest.data.result.wsEndpoint
                        },
                        message: loginFacebookOnServerPostRequest.data.message
                    });
                }
            }
            if (loginFacebookOnServerPostRequest.data.status === "error") {
                return res.status(400).json({
                    status: "error",
                    code: loginFacebookOnServerPostRequest.data?.code,
                    message: loginFacebookOnServerPostRequest.data.message
                });
            }
        }

        return res.status(400).json({
            status: "error",
            message: "Có lỗi xảy ra!"
        });
    } catch (error) {
        console.log("[ERROR]:", error);
        return res.status(400).json({
            status: "error",
            message: "Có lỗi xảy ra!"
        });
    }

})


export default router;