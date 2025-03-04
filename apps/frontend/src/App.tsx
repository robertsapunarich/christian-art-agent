import React, { useCallback, useEffect, useState } from 'react';

// Define types for our application
interface ArtworkAnnotations {
	historicalContext: string;
	artisticStyle: string;
	biblicalNarrative: string;
	interestingDetails: string[];
	uniqueInterpretation: string;
}

interface Artwork {
	id: string;
	title: string;
	artist: string;
	year: number;
	period: string;
	location: string;
	imageUrl: string;
	annotations: ArtworkAnnotations;
}

interface AgentState {
	processingStage: 'idle' | 'analyzing' | 'researching' | 'fetching' | 'annotating' | 'complete' | 'error';
	query?: string;
	error?: string;
	lastUpdated?: string;
}

interface AgentMessage {
	type: 'state' | 'results' | 'error';
	data: any;
}

// Main component
const App: React.FC = (): React.JSX.Element => {
	const [query, setQuery] = useState<string>('');
	const [results, setResults] = useState<Artwork[] | null>(null);
	const [status, setStatus] = useState<string>('idle');
	const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [socket, setSocket] = useState<WebSocket | null>(null);

	// Handle WebSocket connection
	useEffect(() => {
		if (!socket && window.location.hostname) {
			// Create WebSocket connection
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = `${protocol}//${window.location.host}/agents/christian-art-agent-backend/explorer`;

			const ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				console.log('WebSocket connection established');
				setSocket(ws);
			};

			ws.onmessage = (event: MessageEvent) => {
				try {
					const data: AgentMessage = JSON.parse(event.data);

					if (data.type === 'state') {
						setStatus(data.data.processingStage);
						if (data.data.error) {
							setError(data.data.error);
						}
					}

					if (data.type === 'results') {
						setResults(data.data.artworks);
						setIsLoading(false);
					}

					if (data.type === 'error') {
						setError(data.data.message || 'An error occurred');
						setIsLoading(false);
						setStatus('error');
					}
				} catch (error) {
					console.error('Error parsing WebSocket message:', error);
				}
			};

			ws.onclose = () => {
				console.log('WebSocket connection closed');
				setSocket(null);
			};

			ws.onerror = (error: Event) => {
				console.error('WebSocket error:', error);
				setError('WebSocket connection error');
			};

			return () => {
				if (ws && ws.readyState === WebSocket.OPEN) {
					ws.close();
				}
			};
		}
	}, []);

	// Send query via HTTP (fallback when WebSocket is not available)
	const sendQueryViaHttp = useCallback(async (queryText: string): Promise<void> => {
		try {
			const response = await fetch('/agents/christian-art-agent-backend/query', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ query: queryText }),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();

			// Start polling for results
			pollForResults();
		} catch (error) {
			console.error('Error sending query:', error);
			setIsLoading(false);
			setStatus('error');
			setError(error instanceof Error ? error.message : 'Unknown error occurred');
		}
	}, []);

	// Poll for results when using HTTP instead of WebSockets
	const pollForResults = useCallback((): void => {
		const checkStatus = async (): Promise<void> => {
			try {
				// Check status
				const statusResponse = await fetch(`/agents/christian-art-agent-backend/status`);

				if (!statusResponse.ok) {
					throw new Error(`HTTP error! status: ${statusResponse.status}`);
				}

				const statusData = await statusResponse.json();

				setStatus(statusData.state);

				if (statusData.error) {
					setError(statusData.error);
				}

				if (statusData.state === 'complete') {
					// Get results
					const resultsResponse = await fetch(`/agents/christian-art-agent-backend/results`);

					if (!resultsResponse.ok) {
						throw new Error(`HTTP error! status: ${resultsResponse.status}`);
					}

					const resultsData = await resultsResponse.json();

					setResults(resultsData.artworks);
					setIsLoading(false);
					return; // Stop polling
				}

				// Continue polling
				setTimeout(checkStatus, 2000);
			} catch (error) {
				console.error('Error checking status:', error);
				setIsLoading(false);
				setStatus('error');
				setError(error instanceof Error ? error.message : 'Unknown error occurred');
			}
		};

		// Start polling
		setTimeout(checkStatus, 2000);
	}, []);

	// Handle search form submission
	const handleSearch = useCallback(
		(e: React.FormEvent): void => {
			e.preventDefault();

			if (!query.trim()) return;

			setIsLoading(true);
			setStatus('analyzing');
			setResults(null);
			setError(null);

			// Try WebSocket first, fallback to HTTP
			if (socket && socket.readyState === WebSocket.OPEN) {
				socket.send(
					JSON.stringify({
						type: 'query',
						query: query,
					})
				);
			} else {
				sendQueryViaHttp(query);
			}
		},
		[query, socket, sendQueryViaHttp]
	);

	// Handle artwork selection
	const handleArtworkClick = useCallback((artwork: Artwork): void => {
		setSelectedArtwork(artwork);
	}, []);

	// Close artwork details modal
	const closeArtworkDetails = useCallback((): void => {
		setSelectedArtwork(null);
	}, []);

	return (
		<div className="max-w-6xl mx-auto p-6">
			<header className="mb-8 text-center">
				<h1 className="text-3xl font-bold text-gray-800 mb-2">Christian Art Explorer</h1>
				<p className="text-gray-600">Discover paintings depicting biblical narratives throughout history</p>
			</header>

			<form onSubmit={handleSearch} className="mb-8">
				<div className="flex gap-2">
					<input
						type="text"
						value={query}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
						placeholder="Enter a biblical narrative (e.g., 'The Last Supper', 'Noah's Ark')"
						className="flex-1 p-3 border border-gray-300 rounded"
					/>
					<button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded" disabled={isLoading}>
						{isLoading ? 'Searching...' : 'Explore'}
					</button>
				</div>
			</form>

			{status !== 'idle' && status !== 'complete' && status !== 'error' && (
				<div className="text-center mb-8">
					<div className="inline-block p-4 rounded-lg bg-blue-50 text-blue-700">
						<p className="font-medium">Processing your request...</p>
						<p className="text-sm capitalize">{status}</p>
					</div>
				</div>
			)}

			{error && (
				<div className="text-center mb-8">
					<div className="inline-block p-4 rounded-lg bg-red-50 text-red-700">
						<p className="font-medium">There was an error processing your request.</p>
						<p className="text-sm">{error}</p>
					</div>
				</div>
			)}

			{results && results.length > 0 ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{results.map((artwork) => (
						<div
							key={artwork.id}
							className="border rounded-lg overflow-hidden shadow-md hover:shadow-lg transition cursor-pointer"
							onClick={() => handleArtworkClick(artwork)}
						>
							<div className="aspect-w-4 aspect-h-3 bg-gray-100">
								<img
									src={artwork.imageUrl || `/api/placeholder/400/300`}
									alt={artwork.title}
									className="object-cover w-full h-64"
									onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
										e.currentTarget.src = `/api/placeholder/400/300`;
									}}
								/>
							</div>
							<div className="p-4">
								<h3 className="font-bold text-lg">{artwork.title}</h3>
								<p className="text-gray-600">
									{artwork.artist}, {artwork.year}
								</p>
								<p className="text-gray-500 text-sm">{artwork.period} Period</p>
								<p className="text-gray-500 text-sm mt-1">{artwork.location}</p>
							</div>
						</div>
					))}
				</div>
			) : status === 'complete' ? (
				<div className="text-center p-8 bg-gray-50 rounded">
					<p>No artworks found for this query. Try a different biblical narrative.</p>
				</div>
			) : null}

			{selectedArtwork && (
				<div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
					<div className="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-y-auto">
						<div className="flex justify-between items-center p-4 border-b">
							<h2 className="text-xl font-bold">{selectedArtwork.title}</h2>
							<button onClick={closeArtworkDetails} className="text-gray-500 hover:text-gray-700" aria-label="Close details">
								✕
							</button>
						</div>

						<div className="p-6">
							<div className="mb-6">
								<img
									src={selectedArtwork.imageUrl || `/api/placeholder/800/500`}
									alt={selectedArtwork.title}
									className="w-full max-h-96 object-contain"
									onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
										e.currentTarget.src = `/api/placeholder/800/500`;
									}}
								/>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
								<div>
									<h3 className="font-medium text-gray-700">Artist</h3>
									<p>{selectedArtwork.artist}</p>
								</div>
								<div>
									<h3 className="font-medium text-gray-700">Year</h3>
									<p>{selectedArtwork.year}</p>
								</div>
								<div>
									<h3 className="font-medium text-gray-700">Period</h3>
									<p>{selectedArtwork.period}</p>
								</div>
							</div>

							<div className="mb-6">
								<h3 className="font-medium text-gray-700 mb-2">Location</h3>
								<p className="text-gray-600">{selectedArtwork.location}</p>
							</div>

							<div className="mb-6">
								<h3 className="font-medium text-gray-700 mb-2">Biblical Context</h3>
								<p className="text-gray-600">{selectedArtwork.annotations.biblicalNarrative}</p>
							</div>

							<div className="mb-6">
								<h3 className="font-medium text-gray-700 mb-2">Artistic Style</h3>
								<p className="text-gray-600">{selectedArtwork.annotations.artisticStyle}</p>
							</div>

							<div className="mb-6">
								<h3 className="font-medium text-gray-700 mb-2">Historical Context</h3>
								<p className="text-gray-600">{selectedArtwork.annotations.historicalContext}</p>
							</div>

							<div className="mb-6">
								<h3 className="font-medium text-gray-700 mb-2">Unique Interpretation</h3>
								<p className="text-gray-600">{selectedArtwork.annotations.uniqueInterpretation}</p>
							</div>

							<div>
								<h3 className="font-medium text-gray-700 mb-2">Details to Notice</h3>
								<ul className="list-disc pl-5">
									{selectedArtwork.annotations.interestingDetails.map((detail, index) => (
										<li key={index} className="text-gray-600 mb-1">
											{detail}
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default App;