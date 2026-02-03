"""
Test script for the input processing layer
"""

import os
from input_processor import InputProcessorFactory, InputType
from processors.audio_processor import AudioProcessor


def test_audio_processor():
    """Test audio processing with Whisper API"""

    # Initialize factory
    factory = InputProcessorFactory()

    # Register audio processor (with your API key or from env)
    audio_processor = AudioProcessor(
        api_key=os.getenv('OPENAI_API_KEY')  # Set this in .env file
    )
    factory.register_processor(InputType.AUDIO, audio_processor)

    # Test with an audio file
    test_audio_path = "test_audio.mp3"  # Replace with your test file

    if not os.path.exists(test_audio_path):
        print(f"⚠️  Test file not found: {test_audio_path}")
        print("Please add a test audio file or update the path")
        return

    print(f"🎙️  Processing audio file: {test_audio_path}")
    print("-" * 50)

    # Process the audio file
    result = factory.process_file(test_audio_path, InputType.AUDIO)

    # Display results
    if result.success:
        print("✅ Success!")
        print(f"\n📝 Transcribed Text:\n{result.text}\n")
        print(f"📊 Metadata:")
        for key, value in result.metadata.items():
            print(f"   - {key}: {value}")
    else:
        print(f"❌ Error: {result.error}")

    print("-" * 50)

    # Test auto-detection
    print("\n🔍 Testing auto-detection...")
    auto_result = factory.auto_process_file(test_audio_path)
    print(f"Detected type: {auto_result.input_type.value}")
    print(f"Success: {auto_result.success}")


def test_with_timestamps():
    """Test audio processing with timestamp information"""

    audio_processor = AudioProcessor(api_key=os.getenv('OPENAI_API_KEY'))
    test_audio_path = "test_audio.mp3"

    if not os.path.exists(test_audio_path):
        print(f"⚠️  Test file not found: {test_audio_path}")
        return

    print(f"\n🕐 Processing with timestamps: {test_audio_path}")
    print("-" * 50)

    result = audio_processor.process_with_timestamps(test_audio_path)

    if result.success and 'segments_detail' in result.metadata:
        print("✅ Transcription with timestamps:")
        for segment in result.metadata['segments_detail']:
            start = segment['start']
            end = segment['end']
            text = segment['text']
            print(f"[{start:.2f}s - {end:.2f}s]: {text}")
    else:
        print(f"Text: {result.text}")


if __name__ == "__main__":
    print("=" * 50)
    print("🎯 Input Processor Testing")
    print("=" * 50)

    # Make sure API key is set
    if not os.getenv('OPENAI_API_KEY'):
        print("\n⚠️  WARNING: OPENAI_API_KEY not set!")
        print("Set it in your .env file or export it:")
        print("export OPENAI_API_KEY='your-key-here'")
        print("\n⚠️  REMEMBER TO REVOKE YOUR EXPOSED KEY AND GET A NEW ONE!")
        exit(1)

    # Run tests
    test_audio_processor()
    test_with_timestamps()

    print("\n" + "=" * 50)
    print("✅ Testing complete!")
    print("=" * 50)
