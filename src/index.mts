import { Client, ComponentInteraction, Constants, Member, Message } from "eris";
import { parse as parseHJSON } from "hjson";
import { readFileSync } from "fs";
import { Octokit } from "@octokit/rest";
import { join } from "path";
import { Embed, Button, ActionRow } from "eris-util";
import * as Database from "./db.mjs";
import Centra from "centra";

// ✨ Declare basic variables

// ✨ Colors for console.color,
const Colors = {
		black: "\x1b[30m",
		red: "\x1b[31m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		blue: "\x1b[34m",
		magenta: "\x1b[35m",
		cyan: "\x1b[36m",
		white: "\x1b[37m",
	},
	// ✨ Pagination variables
	nextPageMessage =
		"*Click the ◀️ button to go to the previous page, and the ▶️ button to go to the next page.*",
	extraMessages = ({
		content,
		fromDBHDocs,
		isTooLong,
	}: {
		content: string;
		fromDBHDocs?: boolean;
		isTooLong?: boolean;
	}) =>
		(isTooLong ? content + "..." : content) +
		"\n" +
		(fromDBHDocs
			? "*This page was generated from the [unofficial DBH docs](https://docs.dbh.wtf). Incase you find an error, or feel like contributing, please do so [here](https://github.com/DBH-Docs/Documentation).* \n" +
			  nextPageMessage
			: "\n" + nextPageMessage),
	leftButton = (id: string) =>
		new Button()
			.setLabel("◀️")
			.setCustomID(`left-${id}`)
			.setStyle("PRIMARY"),
	deleteButton = (id: string) =>
		new Button()
			.setLabel("⏹️")
			.setCustomID(`delete-${id}`)
			.setStyle("DANGER"),
	rightButton = (id: string) =>
		new Button()
			.setLabel("▶️")
			.setCustomID(`right-${id}`)
			.setStyle("PRIMARY"),
	// ✨ Variables of uttermost importance - the config, the bot client and the GitHub client.
	config = parseHJSON(
		readFileSync("./data/config.hjson", { encoding: "utf8" }),
	) as {
		token: string;
		prefixes: string[];
		GitHubToken: string;
		tagOverrides: Record<string, string>;
	},
	client = new Client(config.token),
	// ✨ To walk through the DBH docs source, and get tag content
	GitHubClient = new Octokit(
		config.GitHubToken ? { auth: config.GitHubToken } : undefined,
	);

// ✨ Make eris and the global console to my liking.

// ✨ Modify eris structures.
Object.defineProperty(Member.prototype, "displayName", {
	get() {
		return this.nick ?? this.user.username;
	},
});

Object.defineProperty(Message.prototype, "guild", {
	get() {
		return client.guilds.get(this.guildID) ?? null;
	},
});

console.color = (color: keyof typeof Colors, text: string) =>
	console.log(Colors[color], text);

// ✨ Fix type declarations

// ✨ Eris structures
declare module "eris" {
	interface Member {
		displayName: string;
	}
	interface Message {
		guild?: import("eris").Guild;
	}
}

// ✨ Global variables
declare global {
	interface Console {
		color: (color: keyof typeof Colors, text: string) => void;
	}
}

// ✨ Functions

// ✨ GitHub walking functions
async function getFiles(path: string): Promise<any[]> {
	return (
		await GitHubClient.rest.repos.getContent({
			owner: "DBH-Docs",
			repo: "Documentation",
			path,
		})
	).data as any[];
}

async function getAllDocs(path: string): Promise<Record<string, string>> {
	const files = await getFiles(path);

	const toReturn: Record<string, string> = {};

	for (const file of files) {
		if (file.type === "dir")
			Object.assign(toReturn, await getAllDocs(join(path, file.name)));
		else if (file.type === "file" && file.name.endsWith(".md"))
			toReturn[file.name.split(".")[0]] = file.download_url;
	}

	return toReturn;
}

// ✨ Pagination functions
export function Paginate(options: {
	tag: string;
	messageID: string;
	channelID: string;
	userID: string;
}): { content: string; page: number; pages: number } {
	const { pages, fromDBHDocs } = Database.getTag(options.tag);

	Database.setPage({
		messageID: options.messageID,
		channelID: options.channelID,
		userID: options.userID,
		page: 0,
		pages: pages.length,
		tag: options.tag,
	});

	return {
		content: extraMessages({
			content: pages[0],
			fromDBHDocs,
			isTooLong: pages.length > 0,
		}),
		page: 1,
		pages: pages.length,
	};
}

export function previousPage(id: string): {
	content: string;
	page: number;
	pages: number;
	botMessage: string;
} {
	const page = Database.getPage(id),
		{ pages, fromDBHDocs } = Database.getTag(page.tag);

	if (page.page === 0) page.page = pages.length - 1;
	else page.page--;

	Database.modifyPage(id, page);

	return {
		content: extraMessages({
			content: pages[page.page],
			fromDBHDocs,
			isTooLong: pages.length > 0,
		}),
		page: page.page + 1,
		pages: pages.length,
		botMessage: page.botMessage,
	};
}

export function nextPage(id: string): {
	content: string;
	page: number;
	pages: number;
	botMessage: string;
} {
	const page = Database.getPage(id),
		{ pages, fromDBHDocs } = Database.getTag(page.tag);

	if (page.page + 1 === pages.length) page.page = 0;
	else page.page++;

	Database.modifyPage(id, page);

	return {
		content: extraMessages({
			content: pages[page.page],
			fromDBHDocs,
			isTooLong: pages.length > 0,
		}),
		page: page.page + 1,
		pages: pages.length,
		botMessage: page.botMessage,
	};
}

console.color("blue", "[Sources] Fetching...");

// ✨ Fetch all the docs and store them in the DB
await getAllDocs("docs")
	.then(async (data) => {
		for (const fullKey of Object.keys(data)) {
			const key = fullKey.split(".")[0];

			Database.addTag({
				name: config.tagOverrides[key] ?? key,
				userTag: "https://docs.dbh.wtf",
				fromDBHDocs: true,
				content: (
					await Centra(data[key])
						.send()
						.then((x) => x.text())
				).replaceAll(/^(#+)(.*)$/gs, (x) =>
					x.replaceAll("#", "").trim(),
				),
			} as Database.TagOptions);
		}
	})
	.catch((e) => {
		console.color(
			"red",
			`[Sources] Failed to fetch from sources. Error: \n${e}`,
		);
		console.color("red", "Exiting process, goodbye.");

		process.exit(1);
	});

console.color("green", "[Sources] Done!");

client.on("ready", () => console.color("green", "[Discord Bot] Ready!"));

client.on("messageCreate", async (message: Message) => {
	if (!config.prefixes.some((x) => message.content.startsWith(x))) return;

	const args = message.content
			.slice(
				config.prefixes.find((x) => message.content.startsWith(x))!
					.length,
			)
			.split(/ +/g),
		command = args.shift()!.toLowerCase();

	const embed = new Embed().setAuthor(
		message.member!.displayName,
		message.member?.avatarURL,
	);

	const foundTag = Database.getTag(command);

	switch (command) {
		case foundTag?.name: {
			const {
				content: pageContent,
				page: currentPage,
				pages: totalPages,
			} = Paginate({
				tag: foundTag.name,
				messageID: message.id,
				userID: message.author.id,
				channelID: message.channel.id,
			});

			embed
				.setDescription(pageContent)
				.setFooter(
					`Page ${currentPage}/${totalPages} | ${
						message.guild!.name
					}`,
					message.guild!.iconURL!,
				);

			const sent = await message.channel.createMessage({
				embed,
				components: [
					new ActionRow()
						.addComponent(leftButton(message.id))
						.addComponent(deleteButton(message.id))
						.addComponent(rightButton(message.id)),
				],
			});

			Database.modifyPage(message.id, { botMessage: sent.id });

			return;
		}
		case "tag": {
		}
	}

	return;
});

client.on("interactionCreate", (interaction: ComponentInteraction) => {
	if (interaction.type !== Constants.InteractionTypes.MESSAGE_COMPONENT)
		return;

	const [action, pageID] = interaction.data.custom_id.split("-"),
		{ message } = interaction;

	switch (action) {
		case "delete": {
			const { channelID, botMessage } = Database.getPage(pageID);

			Database.deletePage(pageID);
			interaction.deferUpdate();

			return client.deleteMessage(channelID, botMessage);
		}
		case "left": {
			const { channelID, botMessage } = Database.getPage(pageID),
				components = [
					new ActionRow()
						.addComponent(leftButton(pageID))
						.addComponent(deleteButton(pageID))
						.addComponent(rightButton(pageID)),
				];

			const {
				content,
				page: newPage,
				pages: newPages,
			} = previousPage(pageID);

			interaction.deferUpdate();

			return client.editMessage(channelID, botMessage, {
				embeds: [
					new Embed()
						.setDescription(content)
						.setAuthor(
							interaction.member!.displayName,
							interaction.member!.avatarURL,
						)
						.setFooter(
							`Page ${newPage}/${newPages} | ${
								message.guild!.name
							}`,
							message.guild!.iconURL!,
						),
				],
				components,
			});
		}
		case "right": {
			const { channelID, botMessage } = Database.getPage(pageID),
				components = [
					new ActionRow()
						.addComponent(leftButton(pageID))
						.addComponent(deleteButton(pageID))
						.addComponent(rightButton(pageID)),
				];

			const {
				content,
				page: newPage,
				pages: newPages,
			} = nextPage(pageID);

			interaction.deferUpdate();

			return client.editMessage(channelID, botMessage, {
				embeds: [
					new Embed()
						.setDescription(content)
						.setAuthor(
							interaction.member!.displayName,
							interaction.member!.avatarURL,
						)
						.setFooter(
							`Page ${newPage}/${newPages} | ${
								message.guild!.name
							}`,
							message.guild!.iconURL!,
						),
				],
				components,
			});
		}
	}

	return;
});

// Login to the client
client.connect();
