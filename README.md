# 大泥湾春秋 pkusChronicles

[pkuschronicles.com](https://pkuschronicles.com)

北大附中学生校史项目。以时间线为骨，以专题为络，记录北大附中自建校至今的历史，聚焦学校改革、学生活动与校园变迁。

多数学生仅有两年在书院中、在"真正的北大附中"里生活——这已足够学生自己建立起书院文化的传承。但这还不够。一年从学长学姐那里接棒、一年向学弟学妹递棒，时间太过短暂。无数历史与传统逐渐消散，老生们习以为常的制度一届届瓦解成传说。对校史没有了解的新生，无法想象曾经有这样一所学校。因此，我们选择自己动手记录。

限于客观条件，我们主要关注 2009 年教育改革以来——尤其是 2019 年往后能够接触当事学生的历史。但我们也欢迎涉及北大附中任何历史时期的贡献。

## 参与贡献

联系方式：[contact@pkuschronicles.com](mailto:contact@pkuschronicles.com)

欢迎所有在校生和校友参与。如果你有想记录的事件、想分享的资料，请联系开发者一同协作。

## 技术

Astro 5 静态站点，TypeScript strict mode。

内容遵循 [ARCHITECTURE.md](./ARCHITECTURE.md) 中定义的数据模型，以条目（Entry）为最小单元，可归属零至多个专题（Topic）。所有资料本地存档，图片自托管于 `public/img/`，后续上CF R2，确保永不丢失。

```bash
npm run dev      # 开发服务器
npm run build    # 构建到 dist/
npm run preview  # 预览构建结果
```

导入语雀知识库：
在语雀网站上导出为lakebook；

```bash
node scripts/yuque-import.mjs [--topic <slug>] <语雀导出文件>
```

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
