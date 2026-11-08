import { chat } from './Chat';
import { BufferedReader, File, InputStreamReader, StandardCharsets, URL, globalAssetsDir } from './Constants';
import { downloadFile } from './FileUtils';

export const fetchURL = (url, headers = {}) => {
    try {
        const conn = new URL(url).openConnection();
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        Object.keys(headers).forEach((key) => {
            const value = headers[key];
            if (value !== undefined && value !== null) {
                conn.setRequestProperty(String(key), String(value));
            }
        });
        const reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        let inputLine;
        let response = '';
        while ((inputLine = reader.readLine()) != null) {
            response += inputLine + '\n';
        }
        reader.close();
        return response;
    } catch (e) {
        console.error('V5 Caught error' + e + e.stack);
        return null;
    }
};

const profilePath = new File(globalAssetsDir, 'discordProfile.png');
let discordPfpPath = null;

export const getDiscordPfpPath = () => discordPfpPath;

export const returnDiscord = (authToken) => {
    discordPfpPath = profilePath.exists() ? profilePath.getAbsolutePath() : null;
};
