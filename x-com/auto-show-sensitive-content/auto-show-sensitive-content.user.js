// ==UserScript==
// @name         Auto Show Sensitive Content
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  X.com (Twitter) Auto Show Sensitive Content. You Don't Have To Click "Show" Button Anymore When Reading NSFW Tweets With Blur Alert. 推特自动显示色情暴力内容，不再被模糊化。
// @author       Martin______X
// @match        https://twitter.com/*
// @include      https://x.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=x.com
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/wikusuma/tampermonkey/main/x-com/
// @downloadURL  https://raw.githubusercontent.com/wikusuma/tampermonkey/main/youtube-com/url-exporter-suite/url-exporter-suite.user.js
// ==/UserScript==

//For Profile caution
let $profile_show_button = "r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-k200y r-1j93nrh r-1mnahxq r-19yznuf r-64el8z r-1fkl15p r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l";
//For Home & Profile--->Tweets
let $home_show_button = "css-g5y9jx r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-173mn98 r-1s2bzr4 r-15ysp7h r-4wgw6l r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l";
//For Sensitive replies
let $reply_sensitive_button = "css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-173mn98 r-1s2bzr4 r-15ysp7h r-4wgw6l r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l";
//For Profile--->Media
let $media_show_button = "css-146c3p1 r-bcqeeo r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-16dba41 r-1loqt21 r-fdjqy7";
 //Annoying Button
let $home_hide_button = "r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-42265s r-u8s1d r-1qd7xl r-15ysp7h r-4wgw6l r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l";

const simpleClick = (async (button)=>{
    button.click();
});
const nfsw_click_interval = setInterval(() => {
    try{
        if(url_check(document.URL)){
            //
            let profile_show_buttons = document.getElementsByClassName($profile_show_button);
            buttons_loop(profile_show_buttons,1);
            //
            let home_show_buttons = document.getElementsByClassName($home_show_button);
            buttons_loop(home_show_buttons,1);
            //
            let media_show_buttons = document.getElementsByClassName($media_show_button);
            buttons_loop(media_show_buttons,1);
            //
            let reply_sensitive_buttons = document.getElementsByClassName($reply_sensitive_button);
            buttons_loop(reply_sensitive_buttons,1);
            //
            let home_hide_buttons = document.getElementsByClassName($home_hide_button);
            buttons_loop(home_hide_buttons,2);
        }
    }catch(error){
        //console.error(error)
    }
}, 1);

const buttons_loop = (buttons, opt) =>{
    for(let i=0;i<buttons.length;i++){
        let button = buttons[i];
        let role = button.getAttribute("role");
        if(button.getAttribute("role") == "button"){
            if(opt==1){
                simpleClick(button);
            }else if(opt ==2){
                button.style.display = 'none';
            }
        }
    }
}

const url_check = (url) => {
    let ex_urls = ["/settings/", "/notifications", "/i/", "/compose/"];
    let in_urls = ["/i/bookmarks","/i/communities/","/i/timeline"];
    if(!included_one_of(url, ex_urls) || included_one_of(url, in_urls)){
        return true;
    }
}

const included_one_of = (url, array) => {
    for(let i=0; i<array.length; i++){
        if(url.includes(array[i])){
            return true;
        }
    }
}
